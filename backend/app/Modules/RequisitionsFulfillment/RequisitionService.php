<?php

declare(strict_types=1);

namespace App\Modules\RequisitionsFulfillment;

use App\Modules\DocumentsReporting\ChapterOutcomes;
use App\Modules\InventoryCustody\InventoryLedgerParticipant;
use App\Modules\InventoryCustody\QuantityMath;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;

/**
 * Phase 2 (P07) Internal Requisition (RF) intake, dual-control review, revision, and two-step stock reservations.
 */
final class RequisitionService
{
    private const array CHAPTER_WIDE_DUTIES = [
        'CHAPTER_HEAD', 'INVENTORY', 'RECEIVING', 'DISPATCH', 'PURCHASING',
        'FINANCE', 'SALES_OFFICER', 'SALES_REVIEWER', 'BOOTH_CUSTODIAN', 'INDEPENDENT_REVIEWER',
    ];

    public function __construct(
        private InventoryLedgerParticipant $inventory,
        private ChapterOutcomes $outcomes,
    ) {}

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $query
     * @return array{http_status: int, body: array<string, mixed>} */
    public function snapshot(int $chapterId, array $actor = [], array $query = []): array
    {
        $cur = $this->outcomes->parseCursor($chapterId, 'requisitions.list', $query);
        if (! $cur['ok']) {
            return $cur['error'];
        }
        $q = DB::table('requisitions')->where('chapter_id', $chapterId);
        if ($this->isUnitScoped($actor)) {
            $q->where('requesting_unit_id', (int) $actor['requesting_unit_id']);
        }
        $bucket = is_string($query['queue_bucket'] ?? null) ? $query['queue_bucket'] : null;
        match ($bucket) {
            'drafts' => $q->whereIn('status', ['draft', 'returned']),
            'awaiting_review' => $q->where('status', 'submitted'),
            'awaiting_allocation' => $q->where('status', 'approved')->where('fulfillment_state', 'unissued'),
            'in_progress' => $q->where('status', 'approved')->whereIn('fulfillment_state', ['partially_reserved', 'fully_reserved', 'partial']),
            'closed' => $q->where(fn ($w) => $w->where('status', 'canceled')->orWhere('fulfillment_state', 'complete')),
            default => null,
        };
        if ($cur['after_id'] > 0) {
            $q->where('id', '>', $cur['after_id']);
        }
        $rows = $q->orderBy('id')->limit($cur['limit'] + 1)->get()->all();
        $hasMore = count($rows) > $cur['limit'];
        $rfs = $hasMore ? array_slice($rows, 0, $cur['limit']) : $rows;
        $nextCursor = $hasMore ? ($cur['encode_cursor'])((int) end($rfs)->id) : null;

        $rfIds = array_map(fn (object $r): int => (int) $r->id, $rfs);
        $linesByRf = DB::table('requisition_lines as rl')
            ->join('item_variants as iv', 'iv.id', '=', 'rl.item_variant_id')->join('items as i', 'i.id', '=', 'iv.item_id')
            ->where('rl.chapter_id', $chapterId)->when($rfIds !== [], fn ($w) => $w->whereIn('rl.rf_id', $rfIds), fn ($w) => $w->whereRaw('1 = 0'))
            ->orderBy('rl.id')->select('rl.*', 'i.sku as variant_sku', 'i.name as item_name')->get()->groupBy('rf_id');

        $allRes = DB::table('rf_reservations')->where('chapter_id', $chapterId)->orderBy('id')->get();
        $resByLine = $allRes->groupBy('rf_line_id');
        $positions = $this->inventory->usableWarehousePositions($chapterId);
        [$usableTotal, $freeByVariant, $stockLots] = ['0', [], []];
        foreach ($positions as $pos) {
            $onHand = QuantityMath::dbToMicroString($pos['on_hand_qty']);
            $resMicro = QuantityMath::dbToMicroString($pos['reserved_qty']);
            $free = QuantityMath::sub($onHand, QuantityMath::dbToMicroString($pos['blocked_qty']));
            $usableTotal = QuantityMath::add($usableTotal, $onHand);
            $freeByVariant[$pos['item_variant_id']] = QuantityMath::add($freeByVariant[$pos['item_variant_id']] ?? '0', $free);
            $stockLots[] = [
                'lot_id' => (string) $pos['stock_lot_id'], 'stock_position_id' => (string) $pos['id'],
                'variant_id' => (string) $pos['item_variant_id'], 'item_name' => $pos['item_name'], 'quantity_scale' => $pos['unit_scale'],
                'accepted_quantity' => QuantityMath::microToWireString($onHand, $pos['unit_scale']),
                'reserved_quantity' => QuantityMath::microToWireString($resMicro, $pos['unit_scale']),
                'free_quantity' => QuantityMath::microToWireString($free, $pos['unit_scale']),
                'stock_version' => $pos['position_version'], 'lot_material_version' => 1, 'intervals' => $pos['intervals'],
            ];
        }

        $rfReservedTotal = '0';
        $formattedRes = [];
        foreach ($allRes as $res) {
            $scale = (int) $res->unit_scale;
            $active = QuantityMath::dbToMicroString((string) $res->active_qty);
            $rfReservedTotal = QuantityMath::add($rfReservedTotal, $active);
            $blocked = $this->inventory->blockedOverlapByRef($chapterId, "rf_prep:{$res->preparation_id}");
            $status = (string) $res->status;
            if (QuantityMath::cmp($active, '0') > 0 && QuantityMath::cmp($blocked, '0') > 0) {
                $status = QuantityMath::cmp($blocked, $active) >= 0 ? 'blocked' : 'partially_blocked';
            }
            $formattedRes[] = [
                'reservation_id' => (string) $res->id, 'preparation_id' => $res->preparation_id !== null ? (string) $res->preparation_id : null,
                'rf_id' => (string) $res->rf_id, 'rf_line_id' => (string) $res->rf_line_id, 'stock_position_id' => (string) $res->stock_position_id,
                'lot_id' => (string) $res->stock_lot_id,
                'committed_quantity' => QuantityMath::microToWireString(QuantityMath::dbToMicroString((string) $res->committed_qty), $scale),
                'active_quantity' => QuantityMath::microToWireString($active, $scale),
                'blocked_quantity' => QuantityMath::microToWireString($blocked, $scale),
                'status' => $status, 'version' => (int) $res->row_version, 'material_version' => (int) $res->material_version, 'expires_at' => null,
            ];
        }

        $rfList = [];
        foreach ($rfs as $rf) {
            $lines = [];
            foreach ($linesByRf->get((int) $rf->id) ?? [] as $l) {
                $scale = (int) $l->unit_scale;
                $resQty = '0';
                foreach ($resByLine->get((int) $l->id) ?? [] as $lr) {
                    $resQty = QuantityMath::add($resQty, QuantityMath::dbToMicroString((string) $lr->active_qty));
                }
                $app = $l->approved_qty !== null ? QuantityMath::dbToMicroString((string) $l->approved_qty) : null;
                $unres = $app !== null ? QuantityMath::max('0', QuantityMath::sub($app, $resQty)) : null;
                $lines[] = [
                    'line_id' => (string) $l->id, 'variant_id' => (string) $l->item_variant_id,
                    'variant_sku' => (string) $l->variant_sku, 'item_name' => (string) $l->item_name,
                    'requested_quantity' => QuantityMath::toUnitQuantity(QuantityMath::dbToMicroString((string) $l->requested_qty), $scale),
                    'approved_quantity' => $app !== null ? QuantityMath::microToWireString($app, $scale) : null,
                    'reserved_quantity' => QuantityMath::microToWireString($resQty, $scale),
                    'shortage_quantity' => $unres !== null ? QuantityMath::microToWireString($unres, $scale) : null,
                    'free_stock_quantity' => QuantityMath::microToWireString($freeByVariant[(int) $l->item_variant_id] ?? '0', $scale),
                ];
            }
            $rfList[] = $this->formatRfHeader($rf, $lines);
        }

        $preps = DB::table('rf_reservation_preparations')->where('chapter_id', $chapterId)->orderBy('id')->get()
            ->map(fn (object $p): array => [
                'preparation_id' => (string) $p->id, 'rf_id' => (string) $p->rf_id, 'rf_line_id' => (string) $p->rf_line_id,
                'stock_position_id' => (string) $p->stock_position_id, 'lot_id' => (string) $p->stock_lot_id,
                'offset_quantity' => QuantityMath::microToWireString(QuantityMath::dbToMicroString((string) $p->offset_qty), (int) $p->unit_scale),
                'quantity' => QuantityMath::microToWireString(QuantityMath::dbToMicroString((string) $p->quantity), (int) $p->unit_scale),
                'prepared_rf_version' => (int) $p->prepared_rf_version, 'prepared_material_version' => (int) $p->prepared_material_version,
                'prepared_progress_version' => (int) $p->prepared_progress_version, 'prepared_stock_version' => (int) $p->prepared_position_version,
                'state' => (string) $p->state, 'version' => (int) $p->row_version, 'reservation_id' => $p->reservation_id !== null ? (string) $p->reservation_id : null,
            ])->values()->all();

        $events = DB::table('requisition_events')->where('chapter_id', $chapterId)->orderBy('id')->get()
            ->map(fn (object $e): array => [
                'event_id' => (string) $e->id, 'rf_id' => (string) $e->rf_id, 'action' => (string) $e->action,
                'version' => (int) $e->row_version, 'material_version' => (int) $e->material_version,
                'progress_version' => (int) $e->progress_version, 'reason' => $e->reason, 'occurred_at' => (string) $e->occurred_at,
            ])->values()->all();

        return ['http_status' => 200, 'body' => [
            'chapter_id' => (string) $chapterId, 'requisitions' => $rfList, 'items' => $rfList, 'next_cursor' => $nextCursor,
            'stock_lots' => $stockLots, 'preparations' => $preps, 'reservations' => $formattedRes, 'history' => $events,
            'summary' => ['usable_on_hand' => QuantityMath::microToWireString($usableTotal, 6), 'rf_reserved' => QuantityMath::microToWireString($rfReservedTotal, 6)],
        ]];
    }

    /** @param array<string, mixed> $actor
     * @return array{http_status: int, body: array<string, mixed>} */
    public function formOptions(int $chapterId, array $actor): array
    {
        $uq = DB::table('requesting_units')->where('chapter_id', $chapterId)->where('active', true);
        if ($this->isUnitScoped($actor)) {
            $uq->where('id', (int) $actor['requesting_unit_id']);
        }
        $units = $uq->orderBy('id')->get()->map(fn (object $u): array => ['requesting_unit_id' => (string) $u->id, 'code' => (string) $u->code, 'name' => (string) $u->name])->values()->all();
        $variants = DB::table('item_variants as iv')->join('items as i', 'i.id', '=', 'iv.item_id')->join('units as u', 'u.id', '=', 'i.base_unit_id')
            ->where('iv.chapter_id', $chapterId)->where('iv.active', true)->orderBy('iv.id')
            ->select('iv.id', 'iv.variant_code', 'i.sku', 'i.name as item_name', 'u.code as unit_code', 'u.quantity_scale')->get()
            ->map(fn (object $v): array => ['variant_id' => (string) $v->id, 'sku' => (string) $v->sku, 'item_name' => (string) $v->item_name, 'variant_code' => (string) $v->variant_code, 'unit_code' => (string) $v->unit_code, 'quantity_scale' => (int) $v->quantity_scale])->values()->all();

        return ['http_status' => 200, 'body' => [
            'chapter_id' => (string) $chapterId, 'authorized_requesting_units' => $units, 'catalog_variants' => $variants,
        ]];
    }

    /** @param array<string, mixed> $actor
     * @return array{http_status: int, body: array<string, mixed>} */
    public function showSummary(int $chapterId, array $actor, int $rfId): array
    {
        $rf = DB::table('requisitions')->where('chapter_id', $chapterId)->where('id', $rfId)->first();
        if ($rf === null) {
            return $this->outcomes->blocked($chapterId, 404, 'RF_NOT_FOUND', 'Requisition not found.');
        }
        if (! $this->canAccessRf($actor, $rf)) {
            return $this->outcomes->forbidden('FORBIDDEN', 'Requisition belongs to a different requesting unit.');
        }

        return ['http_status' => 200, 'body' => ['chapter_id' => (string) $chapterId, 'requisition' => $this->loadRfDto($chapterId, $rfId)]];
    }

    /** @param array<string, mixed> $actor
     * @return array{http_status: int, body: array<string, mixed>} */
    public function showHistory(int $chapterId, array $actor, int $rfId): array
    {
        $rf = DB::table('requisitions')->where('chapter_id', $chapterId)->where('id', $rfId)->first();
        if ($rf === null) {
            return $this->outcomes->blocked($chapterId, 404, 'RF_NOT_FOUND', 'Requisition not found.');
        }
        if (! $this->canAccessRf($actor, $rf)) {
            return $this->outcomes->forbidden('FORBIDDEN', 'Requisition belongs to a different requesting unit.');
        }
        $events = DB::table('requisition_events')->where('chapter_id', $chapterId)->where('rf_id', $rfId)->orderBy('id')->get()
            ->map(fn (object $e): array => ['event_id' => (string) $e->id, 'action' => (string) $e->action, 'row_version' => (int) $e->row_version, 'material_version' => (int) $e->material_version, 'progress_version' => (int) $e->progress_version, 'reason' => $e->reason, 'occurred_at' => (string) $e->occurred_at])->values()->all();

        return ['http_status' => 200, 'body' => ['chapter_id' => (string) $chapterId, 'rf_id' => (string) $rfId, 'events' => $events]];
    }

    /** @param array<string, mixed> $actor
     * @return array{http_status: int, body: array<string, mixed>} */
    public function allocationProposal(int $chapterId, array $actor, int $rfId): array
    {
        $rf = DB::table('requisitions')->where('chapter_id', $chapterId)->where('id', $rfId)->first();
        if ($rf === null) {
            return $this->outcomes->blocked($chapterId, 404, 'RF_NOT_FOUND', 'Requisition not found.');
        }
        if (! $this->canAccessRf($actor, $rf)) {
            return $this->outcomes->forbidden('FORBIDDEN', 'Requisition belongs to a different requesting unit.');
        }
        $lines = DB::table('requisition_lines')->where('chapter_id', $chapterId)->where('rf_id', $rfId)->orderBy('id')->get();
        $positions = $this->inventory->usableWarehousePositions($chapterId);
        $proposals = [];
        foreach ($lines as $l) {
            $need = $this->unreservedLineMicro($chapterId, $l);
            $candidates = [];
            foreach ($positions as $p) {
                if ($p['item_variant_id'] !== (int) $l->item_variant_id) {
                    continue;
                }
                $elig = $this->inventory->queryEligibility($chapterId, (int) $l->item_variant_id, ['requesting_unit_id' => $rf->requesting_unit_id !== null ? (string) $rf->requesting_unit_id : null]);
                if ($this->isPosEligible($elig, $p['id'])) {
                    $candidates[] = ['stock_position_id' => (string) $p['id'], 'lot_id' => (string) $p['stock_lot_id'], 'position_version' => $p['position_version'], 'intervals' => $p['intervals']];
                }
            }
            $proposals[] = ['rf_line_id' => (string) $l->id, 'variant_id' => (string) $l->item_variant_id, 'remaining_need' => QuantityMath::microToWireString($need, (int) $l->unit_scale), 'candidates' => $candidates];
        }

        return ['http_status' => 200, 'body' => ['chapter_id' => (string) $chapterId, 'rf_id' => (string) $rfId, 'proposals' => $proposals]];
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function createDraft(int $chapterId, array $actor, string $key, array $in): array
    {
        $purpose = (string) ($in['purpose_kind'] ?? 'internal');
        if (! in_array($purpose, ['internal', 'booth'], true)) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'purpose_kind must be internal or booth.');
        }
        $lines = $this->parseLines($chapterId, (array) ($in['lines'] ?? []), true);
        if (isset($lines['http_status'])) {
            return $lines;
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'rf.create_draft', 'CreateRf@p07.v1', $in);

        return DB::transaction(function () use ($chapterId, $actor, $key, $hash, $in, $purpose, $lines): array {
            if (($r = $this->outcomes->replay($chapterId, 'rf.create_draft', $key, $hash)) !== null) {
                return $r;
            }
            $unitId = $this->validUnit($chapterId, $in['requesting_unit_id'] ?? ($actor['requesting_unit_id'] ?? null));
            if ($unitId === false) {
                return $this->outcomes->blocked($chapterId, 422, 'INVALID_REQUESTING_UNIT', 'Requesting unit not found in chapter.');
            }
            if ($this->isUnitScoped($actor) && $unitId !== (int) $actor['requesting_unit_id']) {
                return $this->outcomes->forbidden('FORBIDDEN', 'Unit-scoped requester cannot create a requisition for another unit.');
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $rfId = DB::table('requisitions')->insertGetId([
                'chapter_id' => $chapterId, 'requesting_unit_id' => $unitId, 'requester_user_id' => (int) $actor['user_id'],
                'purpose_kind' => $purpose, 'needed_at' => $this->normTs($in['needed_at'] ?? null), 'justification' => $in['justification'] ?? null,
                'status' => 'draft', 'fulfillment_state' => 'unissued', 'row_version' => 1, 'material_version' => 1, 'progress_version' => 1,
                'created_at' => $now, 'updated_at' => $now,
            ]);
            foreach ($lines as $l) {
                DB::table('requisition_lines')->insert([
                    'chapter_id' => $chapterId, 'rf_id' => $rfId, 'item_variant_id' => $l['variant_id'], 'unit_scale' => $l['scale'],
                    'requested_qty' => $l['db_qty'], 'issued_qty' => '0.000000', 'canceled_qty' => '0.000000', 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
            $this->logEvent($chapterId, $rfId, 1, 1, 1, 'createInternalRf', (int) $actor['user_id'], null, $now);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'rf.create_draft', $key, $hash, 'CreateRf@p07.v1',
                ChapterOutcomes::recordState((string) $rfId, 'RF', 1, 1, ['status' => 'draft', 'fulfillment_state' => 'unissued']),
                ['requisition' => $this->loadRfDto($chapterId, $rfId)], 201);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function replaceDraft(int $chapterId, array $actor, int $rfId, string $key, array $in): array
    {
        $lines = $this->parseLines($chapterId, (array) ($in['lines'] ?? []), false);
        if (isset($lines['http_status'])) {
            return $lines;
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'rf.save_draft', 'SaveDraft@p07.v1', ['rf_id' => $rfId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $rfId, $key, $hash, $in, $lines): array {
            if (($r = $this->outcomes->replay($chapterId, 'rf.save_draft', $key, $hash)) !== null) {
                return $r;
            }
            $rf = DB::table('requisitions')->where('chapter_id', $chapterId)->where('id', $rfId)->lockForUpdate()->first();
            if ($rf === null) {
                return $this->outcomes->blocked($chapterId, 404, 'RF_NOT_FOUND', 'Requisition not found.');
            }
            if (! $this->canAccessRf($actor, $rf)) {
                return $this->outcomes->forbidden('FORBIDDEN', 'Requisition belongs to a different requesting unit.');
            }
            if ((string) $rf->status !== 'draft') {
                return $this->outcomes->blocked($chapterId, 409, 'RF_NOT_DRAFT', 'Only draft requisitions can be replaced directly.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $rf->row_version
                || (isset($in['expected_material_version']) && (int) $in['expected_material_version'] !== (int) $rf->material_version)) {
                return $this->outcomes->stale($chapterId, $this->rfRecordState($rf));
            }
            $now = now()->format('Y-m-d H:i:s.u');
            DB::table('requisition_lines')->where('chapter_id', $chapterId)->where('rf_id', $rfId)->delete();
            foreach ($lines as $l) {
                DB::table('requisition_lines')->insert([
                    'chapter_id' => $chapterId, 'rf_id' => $rfId, 'item_variant_id' => $l['variant_id'], 'unit_scale' => $l['scale'],
                    'requested_qty' => $l['db_qty'], 'issued_qty' => '0.000000', 'canceled_qty' => '0.000000', 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
            $newVer = (int) $rf->row_version + 1;
            DB::table('requisitions')->where('id', $rfId)->update([
                'requesting_unit_id' => $in['requesting_unit_id'] ?? $rf->requesting_unit_id,
                'needed_at' => array_key_exists('needed_at', $in) ? $this->normTs($in['needed_at']) : $rf->needed_at,
                'justification' => $in['justification'] ?? $rf->justification,
                'row_version' => $newVer, 'updated_at' => $now,
            ]);
            $this->logEvent($chapterId, $rfId, $newVer, (int) $rf->material_version, (int) $rf->progress_version, 'replaceInternalRfDraft', (int) $actor['user_id'], $in['reason'] ?? null, $now);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'rf.save_draft', $key, $hash, 'SaveDraft@p07.v1',
                ChapterOutcomes::recordState((string) $rfId, 'RF', $newVer, (int) $rf->material_version, ['status' => 'draft', 'fulfillment_state' => (string) $rf->fulfillment_state]),
                ['requisition' => $this->loadRfDto($chapterId, $rfId)]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function discardDraft(int $chapterId, array $actor, int $rfId, string $key, array $in): array
    {
        $hash = ChapterOutcomes::fingerprint($chapterId, 'rf.discard_draft', 'DiscardDraft@p07.v1', ['rf_id' => $rfId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $rfId, $key, $hash, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'rf.discard_draft', $key, $hash)) !== null) {
                return $r;
            }
            $rf = DB::table('requisitions')->where('chapter_id', $chapterId)->where('id', $rfId)->lockForUpdate()->first();
            if ($rf === null) {
                return $this->outcomes->blocked($chapterId, 404, 'RF_NOT_FOUND', 'Requisition not found.');
            }
            if (! $this->canAccessRf($actor, $rf)) {
                return $this->outcomes->forbidden('FORBIDDEN', 'Requisition belongs to a different requesting unit.');
            }
            if (! in_array((string) $rf->status, ['draft', 'returned'], true)) {
                return $this->outcomes->blocked($chapterId, 409, 'RF_NOT_DRAFT', 'Submitted or approved requisitions must be canceled instead of discarded.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $rf->row_version) {
                return $this->outcomes->stale($chapterId, $this->rfRecordState($rf));
            }
            $now = now()->format('Y-m-d H:i:s.u');
            [$newVer, $newProg] = [(int) $rf->row_version + 1, (int) $rf->progress_version + 1];
            DB::table('requisition_lines')->where('chapter_id', $chapterId)->where('rf_id', $rfId)->update(['canceled_qty' => DB::raw('requested_qty'), 'updated_at' => $now]);
            DB::table('requisitions')->where('id', $rfId)->update(['status' => 'canceled', 'cancel_reason' => 'Draft discarded', 'row_version' => $newVer, 'progress_version' => $newProg, 'updated_at' => $now]);
            $this->logEvent($chapterId, $rfId, $newVer, (int) $rf->material_version, $newProg, 'discardInternalRfDraft', (int) $actor['user_id'], 'Draft discarded', $now);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'rf.discard_draft', $key, $hash, 'DiscardDraft@p07.v1',
                ChapterOutcomes::recordState((string) $rfId, 'RF', $newVer, (int) $rf->material_version, ['status' => 'canceled', 'discarded' => 'true']),
                ['requisition' => $this->loadRfDto($chapterId, $rfId), 'discarded' => true]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function submit(int $chapterId, array $actor, int $rfId, string $key, array $in): array
    {
        $hash = ChapterOutcomes::fingerprint($chapterId, 'rf.submit', 'SubmitRf@p07.v1', ['rf_id' => $rfId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $rfId, $key, $hash, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'rf.submit', $key, $hash)) !== null) {
                return $r;
            }
            $rf = DB::table('requisitions')->where('chapter_id', $chapterId)->where('id', $rfId)->lockForUpdate()->first();
            if ($rf === null) {
                return $this->outcomes->blocked($chapterId, 404, 'RF_NOT_FOUND', 'Requisition not found.');
            }
            if (! $this->canAccessRf($actor, $rf)) {
                return $this->outcomes->forbidden('FORBIDDEN', 'Requisition belongs to a different requesting unit.');
            }
            if (! in_array((string) $rf->status, ['draft', 'returned'], true)) {
                return $this->outcomes->blocked($chapterId, 409, 'INVALID_TRANSITION', 'Requisition must be draft or returned to submit.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $rf->row_version
                || (isset($in['expected_material_version']) && (int) $in['expected_material_version'] !== (int) $rf->material_version)) {
                return $this->outcomes->stale($chapterId, $this->rfRecordState($rf));
            }
            if (DB::table('requisition_lines')->where('chapter_id', $chapterId)->where('rf_id', $rfId)->count() === 0) {
                return $this->outcomes->blocked($chapterId, 422, 'EMPTY_REQUISITION_LINES', 'Cannot submit an empty requisition.');
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $newVer = (int) $rf->row_version + 1;
            $ref = $rf->reference ?: sprintf('RF-%d-%05d', $chapterId, $rfId);
            DB::table('requisitions')->where('id', $rfId)->update(['status' => 'submitted', 'reference' => $ref, 'submitted_at' => $now, 'return_reason' => null, 'row_version' => $newVer, 'updated_at' => $now]);
            $this->logEvent($chapterId, $rfId, $newVer, (int) $rf->material_version, (int) $rf->progress_version, 'submitInternalRf', (int) $actor['user_id'], null, $now);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'rf.submit', $key, $hash, 'SubmitRf@p07.v1',
                ChapterOutcomes::recordState((string) $rfId, 'RF', $newVer, (int) $rf->material_version, ['status' => 'submitted', 'fulfillment_state' => (string) $rf->fulfillment_state]),
                ['requisition' => $this->loadRfDto($chapterId, $rfId)]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function review(int $chapterId, array $actor, int $rfId, string $key, array $in): array
    {
        $decision = (string) ($in['decision'] ?? '');
        $reason = trim((string) ($in['reason'] ?? ''));
        if (! in_array($decision, ['approve', 'return'], true)) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'decision must be approve or return.');
        }
        if ($decision === 'return' && $reason === '') {
            return $this->outcomes->blocked($chapterId, 422, 'REASON_REQUIRED', 'A return reason is required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'rf.review', 'ReviewRf@p07.v1', ['rf_id' => $rfId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $rfId, $key, $hash, $in, $decision, $reason): array {
            if (($r = $this->outcomes->replay($chapterId, 'rf.review', $key, $hash)) !== null) {
                return $r;
            }
            $rf = DB::table('requisitions')->where('chapter_id', $chapterId)->where('id', $rfId)->lockForUpdate()->first();
            if ($rf === null) {
                return $this->outcomes->blocked($chapterId, 404, 'RF_NOT_FOUND', 'Requisition not found.');
            }
            if ((string) $rf->status !== 'submitted') {
                return $this->outcomes->blocked($chapterId, 409, 'INVALID_TRANSITION', 'Requisition must be submitted before review.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $rf->row_version
                || ! is_int($in['expected_material_version'] ?? null) || (int) $in['expected_material_version'] !== (int) $rf->material_version) {
                return $this->outcomes->stale($chapterId, $this->rfRecordState($rf));
            }
            if ($decision === 'approve' && (int) $rf->requester_user_id === (int) $actor['user_id']) {
                return $this->outcomes->forbidden('SELF_APPROVAL_FORBIDDEN', 'GOV-05: Requester cannot approve their own requisition even when holding approver authority.');
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $newVer = (int) $rf->row_version + 1;
            if ($decision === 'approve') {
                $duty = in_array('CHAPTER_HEAD', (array) $actor['duties'], true) ? 'CHAPTER_HEAD' : 'RF_APPROVER';
                DB::table('requisition_lines')->where('chapter_id', $chapterId)->where('rf_id', $rfId)
                    ->update(['approved_qty' => DB::raw('requested_qty'), 'updated_at' => $now]);
                DB::table('requisitions')->where('id', $rfId)->update([
                    'status' => 'approved', 'approved_by_user_id' => (int) $actor['user_id'], 'approved_duty_code' => $duty,
                    'approved_material_version' => (int) $rf->material_version, 'approved_at' => $now, 'row_version' => $newVer, 'updated_at' => $now,
                ]);
                $this->logEvent($chapterId, $rfId, $newVer, (int) $rf->material_version, (int) $rf->progress_version, 'approveInternalRf', (int) $actor['user_id'], null, $now);
            } else {
                DB::table('requisitions')->where('id', $rfId)->update(['status' => 'returned', 'return_reason' => $reason, 'row_version' => $newVer, 'updated_at' => $now]);
                $this->logEvent($chapterId, $rfId, $newVer, (int) $rf->material_version, (int) $rf->progress_version, 'returnInternalRf', (int) $actor['user_id'], $reason, $now);
            }

            return $this->outcomes->commitSuccess($chapterId, $actor, 'rf.review', $key, $hash, 'ReviewRf@p07.v1',
                ChapterOutcomes::recordState((string) $rfId, 'RF', $newVer, (int) $rf->material_version, ['status' => $decision === 'approve' ? 'approved' : 'returned', 'fulfillment_state' => (string) $rf->fulfillment_state]),
                ['requisition' => $this->loadRfDto($chapterId, $rfId)]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function revise(int $chapterId, array $actor, int $rfId, string $key, array $in): array
    {
        $reason = trim((string) ($in['reason'] ?? ''));
        if ($reason === '') {
            return $this->outcomes->blocked($chapterId, 422, 'REASON_REQUIRED', 'A revision reason is required.');
        }
        $lines = $this->parseLines($chapterId, (array) ($in['lines'] ?? []), false);
        if (isset($lines['http_status'])) {
            return $lines;
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'rf.revise', 'ReviseRf@p07.v1', ['rf_id' => $rfId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $rfId, $key, $hash, $in, $lines, $reason): array {
            if (($r = $this->outcomes->replay($chapterId, 'rf.revise', $key, $hash)) !== null) {
                return $r;
            }
            $rf = DB::table('requisitions')->where('chapter_id', $chapterId)->where('id', $rfId)->lockForUpdate()->first();
            if ($rf === null) {
                return $this->outcomes->blocked($chapterId, 404, 'RF_NOT_FOUND', 'Requisition not found.');
            }
            if (! $this->canAccessRf($actor, $rf)) {
                return $this->outcomes->forbidden('FORBIDDEN', 'Requisition belongs to a different requesting unit.');
            }
            if ((string) $rf->status === 'canceled') {
                return $this->outcomes->blocked($chapterId, 409, 'RF_CANCELED', 'Canceled requisition cannot be revised.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $rf->row_version
                || (int) ($in['expected_material_version'] ?? 0) !== (int) $rf->material_version
                || (int) ($in['expected_progress_version'] ?? 0) !== (int) $rf->progress_version) {
                return $this->outcomes->stale($chapterId, $this->rfRecordState($rf));
            }
            $hasActiveRes = DB::table('rf_reservations')->where('chapter_id', $chapterId)->where('rf_id', $rfId)->where('active_qty', '>', 0)->exists();
            $hasIssued = DB::table('requisition_lines')->where('chapter_id', $chapterId)->where('rf_id', $rfId)->where('issued_qty', '>', 0)->exists();
            if ($hasActiveRes || $hasIssued) {
                return $this->outcomes->blocked($chapterId, 409, 'ACTIVE_COMMITMENT_EXCEEDS_REVISION', 'Release active reservations before materially revising this requisition.');
            }

            $now = now()->format('Y-m-d H:i:s.u');
            DB::table('requisition_lines')->where('chapter_id', $chapterId)->where('rf_id', $rfId)->delete();
            foreach ($lines as $l) {
                DB::table('requisition_lines')->insert([
                    'chapter_id' => $chapterId, 'rf_id' => $rfId, 'item_variant_id' => $l['variant_id'], 'unit_scale' => $l['scale'],
                    'requested_qty' => $l['db_qty'], 'approved_qty' => null, 'issued_qty' => '0.000000', 'canceled_qty' => '0.000000',
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            }
            [$newVer, $newMat] = [(int) $rf->row_version + 1, (int) $rf->material_version + 1];
            DB::table('requisitions')->where('id', $rfId)->update([
                'status' => 'draft', 'requesting_unit_id' => $in['requesting_unit_id'] ?? $rf->requesting_unit_id,
                'needed_at' => array_key_exists('needed_at', $in) ? $this->normTs($in['needed_at']) : $rf->needed_at,
                'justification' => $in['justification'] ?? $rf->justification,
                'approved_by_user_id' => null, 'approved_duty_code' => null, 'approved_material_version' => null, 'approved_at' => null,
                'return_reason' => null, 'row_version' => $newVer, 'material_version' => $newMat, 'updated_at' => $now,
            ]);
            $this->logEvent($chapterId, $rfId, $newVer, $newMat, (int) $rf->progress_version, 'reviseInternalRf', (int) $actor['user_id'], $reason, $now);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'rf.revise', $key, $hash, 'ReviseRf@p07.v1',
                ChapterOutcomes::recordState((string) $rfId, 'RF', $newVer, $newMat, ['status' => 'draft', 'fulfillment_state' => (string) $rf->fulfillment_state]),
                ['requisition' => $this->loadRfDto($chapterId, $rfId)]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function cancel(int $chapterId, array $actor, int $rfId, string $key, array $in): array
    {
        $reason = trim((string) ($in['reason'] ?? ''));
        if ($reason === '') {
            return $this->outcomes->blocked($chapterId, 422, 'REASON_REQUIRED', 'A cancellation reason is required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'rf.cancel', 'CancelRf@p07.v1', ['rf_id' => $rfId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $rfId, $key, $hash, $in, $reason): array {
            if (($r = $this->outcomes->replay($chapterId, 'rf.cancel', $key, $hash)) !== null) {
                return $r;
            }
            $rf = DB::table('requisitions')->where('chapter_id', $chapterId)->where('id', $rfId)->lockForUpdate()->first();
            if ($rf === null) {
                return $this->outcomes->blocked($chapterId, 404, 'RF_NOT_FOUND', 'Requisition not found.');
            }
            if (! $this->canAccessRf($actor, $rf)) {
                return $this->outcomes->forbidden('FORBIDDEN', 'Requisition belongs to a different requesting unit.');
            }
            if ((string) $rf->status === 'canceled') {
                return $this->outcomes->blocked($chapterId, 409, 'RF_ALREADY_CANCELED', 'Requisition is already canceled.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $rf->row_version
                || (int) ($in['expected_material_version'] ?? 0) !== (int) $rf->material_version
                || (int) ($in['expected_progress_version'] ?? 0) !== (int) $rf->progress_version) {
                return $this->outcomes->stale($chapterId, $this->rfRecordState($rf));
            }
            $now = now()->format('Y-m-d H:i:s.u');
            foreach (DB::table('rf_reservations')->where('chapter_id', $chapterId)->where('rf_id', $rfId)->where('active_qty', '>', 0)->lockForUpdate()->get() as $res) {
                $this->releaseResRow($chapterId, $res, (int) $actor['user_id'], $reason, $now);
            }
            DB::table('requisition_lines')->where('chapter_id', $chapterId)->where('rf_id', $rfId)
                ->update(['canceled_qty' => DB::raw('requested_qty - issued_qty'), 'updated_at' => $now]);
            [$newVer, $newProg] = [(int) $rf->row_version + 1, (int) $rf->progress_version + 1];
            DB::table('requisitions')->where('id', $rfId)->update([
                'status' => 'canceled', 'cancel_reason' => $reason, 'row_version' => $newVer, 'progress_version' => $newProg, 'updated_at' => $now,
            ]);
            $this->logEvent($chapterId, $rfId, $newVer, (int) $rf->material_version, $newProg, 'cancelInternalRf', (int) $actor['user_id'], $reason, $now);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'rf.cancel', $key, $hash, 'CancelRf@p07.v1',
                ChapterOutcomes::recordState((string) $rfId, 'RF', $newVer, (int) $rf->material_version, ['status' => 'canceled', 'fulfillment_state' => (string) $rf->fulfillment_state]),
                ['requisition' => $this->loadRfDto($chapterId, $rfId)]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function prepareReservation(int $chapterId, array $actor, int $rfId, string $key, array $in): array
    {
        [$lineRaw, $posRaw, $offRaw, $qtyRaw] = [(string) ($in['rf_line_id'] ?? ''), (string) ($in['stock_position_id'] ?? ''), (string) ($in['offset_value'] ?? '0'), (string) ($in['quantity_value'] ?? '0')];
        if (preg_match('/^[1-9][0-9]{0,18}$/', $lineRaw) !== 1 || preg_match('/^[1-9][0-9]{0,18}$/', $posRaw) !== 1) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'Valid rf_line_id and stock_position_id are required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'rf.prepare_reservation', 'PrepareRfRes@p07.v1', ['rf_id' => $rfId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $rfId, $key, $hash, $lineRaw, $posRaw, $offRaw, $qtyRaw): array {
            if (($r = $this->outcomes->replay($chapterId, 'rf.prepare_reservation', $key, $hash)) !== null) {
                return $r;
            }
            $rf = DB::table('requisitions')->where('chapter_id', $chapterId)->where('id', $rfId)->lockForUpdate()->first();
            $line = $rf !== null ? DB::table('requisition_lines')->where('chapter_id', $chapterId)->where('rf_id', $rfId)->where('id', (int) $lineRaw)->lockForUpdate()->first() : null;
            $pos = $this->inventory->positionSnapshot($chapterId, (int) $posRaw, true);
            if ($rf === null || $line === null || $pos === null || $pos['item_variant_id'] !== (int) $line->item_variant_id) {
                return $this->outcomes->blocked($chapterId, 404, 'RESERVATION_TARGET_NOT_FOUND', 'Requisition, line, or matching stock position not found.');
            }
            if ((string) $rf->status !== 'approved') {
                return $this->outcomes->blocked($chapterId, 409, 'RF_NOT_APPROVED', 'Requisition must be approved before reserving stock.');
            }
            $scale = (int) $line->unit_scale;
            try {
                $offMicro = QuantityMath::toMicroString($offRaw, $scale);
                $qtyMicro = QuantityMath::toMicroString($qtyRaw, $scale);
            } catch (InvalidArgumentException $e) {
                return $this->outcomes->blocked($chapterId, 422, 'INVALID_UNIT_PRECISION', $e->getMessage());
            }
            if (QuantityMath::cmp($qtyMicro, '0') <= 0) {
                return $this->outcomes->blocked($chapterId, 422, 'INVALID_QUANTITY', 'Reservation quantity must exceed zero.');
            }

            $elig = $this->inventory->queryEligibility($chapterId, (int) $line->item_variant_id, [
                'requesting_unit_id' => $rf->requesting_unit_id !== null ? (string) $rf->requesting_unit_id : null,
                'requested_qty' => QuantityMath::microToWireString($qtyMicro, $scale),
            ]);
            if (! $this->isPosEligible($elig, $pos['id'])) {
                return $this->outcomes->blocked($chapterId, 409, 'STOCK_POSITION_INELIGIBLE', 'Target stock position failed chapter policy, condition, or donor restriction check.');
            }

            $unresRem = $this->unreservedLineMicro($chapterId, $line);
            if (QuantityMath::cmp($qtyMicro, $unresRem) > 0) {
                return $this->outcomes->blocked($chapterId, 409, 'EXCEEDS_REMAINING_DEMAND', 'Requested reservation exceeds remaining unreserved line demand.');
            }
            $onHand = QuantityMath::dbToMicroString($pos['on_hand_qty']);
            if (QuantityMath::cmp(QuantityMath::add($offMicro, $qtyMicro), $onHand) > 0) {
                return $this->outcomes->blocked($chapterId, 409, 'INTERVAL_EXCEEDS_ON_HAND', 'Requested interval exceeds position on-hand quantity.');
            }

            $now = now()->format('Y-m-d H:i:s.u');
            $prepId = DB::table('rf_reservation_preparations')->insertGetId([
                'chapter_id' => $chapterId, 'rf_id' => $rfId, 'rf_line_id' => (int) $line->id,
                'stock_position_id' => $pos['id'], 'stock_lot_id' => $pos['stock_lot_id'],
                'offset_qty' => QuantityMath::microToDbString($offMicro), 'quantity' => QuantityMath::microToDbString($qtyMicro), 'unit_scale' => $scale,
                'prepared_rf_version' => (int) $rf->row_version, 'prepared_material_version' => (int) $rf->material_version,
                'prepared_progress_version' => (int) $rf->progress_version, 'prepared_position_version' => $pos['position_version'],
                'state' => 'prepared', 'row_version' => 1, 'prepared_by_user_id' => (int) $actor['user_id'], 'created_at' => $now, 'updated_at' => $now,
            ]);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'rf.prepare_reservation', $key, $hash, 'PrepareRfRes@p07.v1',
                ChapterOutcomes::recordState((string) $prepId, 'RF_PREPARATION', 1, (int) $rf->material_version, ['state' => 'prepared']),
                ['preparation' => [
                    'preparation_id' => (string) $prepId, 'rf_id' => (string) $rfId, 'rf_line_id' => (string) $line->id,
                    'stock_position_id' => (string) $pos['id'], 'lot_id' => (string) $pos['stock_lot_id'],
                    'offset_quantity' => QuantityMath::microToWireString($offMicro, $scale), 'quantity' => QuantityMath::microToWireString($qtyMicro, $scale),
                    'prepared_rf_version' => (int) $rf->row_version, 'prepared_material_version' => (int) $rf->material_version,
                    'prepared_progress_version' => (int) $rf->progress_version, 'prepared_stock_version' => $pos['position_version'],
                    'state' => 'prepared', 'version' => 1, 'reservation_id' => null,
                ]], 201);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function commitReservation(int $chapterId, array $actor, int $rfId, string $key, array $in): array
    {
        $prepRaw = (string) ($in['preparation_id'] ?? '');
        if (preg_match('/^[1-9][0-9]{0,18}$/', $prepRaw) !== 1) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'Valid preparation_id is required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'rf.allocate_stock', 'CommitRfRes@p07.v1', ['rf_id' => $rfId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $rfId, $key, $hash, $in, $prepRaw): array {
            if (($r = $this->outcomes->replay($chapterId, 'rf.allocate_stock', $key, $hash)) !== null) {
                return $r;
            }
            $peek = DB::table('rf_reservation_preparations')->where('chapter_id', $chapterId)->where('rf_id', $rfId)->where('id', (int) $prepRaw)->first();
            if ($peek === null) {
                return $this->outcomes->blocked($chapterId, 404, 'PREPARATION_NOT_FOUND', 'Reservation preparation not found for this requisition.');
            }
            $line = DB::table('requisition_lines')->where('chapter_id', $chapterId)->where('id', (int) $peek->rf_line_id)->first();
            $pos = $this->inventory->positionSnapshot($chapterId, (int) $peek->stock_position_id, true);
            $rf = DB::table('requisitions')->where('chapter_id', $chapterId)->where('id', $rfId)->lockForUpdate()->first();
            $prep = DB::table('rf_reservation_preparations')->where('id', (int) $peek->id)->lockForUpdate()->first();

            if ($rf === null || $line === null || $pos === null || $prep === null || (string) $prep->state !== 'prepared') {
                return $this->outcomes->blocked($chapterId, 409, 'PREPARATION_ALREADY_COMMITTED', 'Preparation has already been committed or is invalid.');
            }
            if ((string) $rf->status !== 'approved') {
                return $this->outcomes->blocked($chapterId, 409, 'RF_NOT_APPROVED', 'Requisition is no longer approved.');
            }
            $expRf = (int) ($in['expected_row_version'] ?? ($in['expected_rf_version'] ?? $prep->prepared_rf_version));
            $expMat = (int) ($in['expected_material_version'] ?? $prep->prepared_material_version);
            $expProg = (int) ($in['expected_progress_version'] ?? $prep->prepared_progress_version);
            $expStock = (int) ($in['expected_stock_version'] ?? $prep->prepared_position_version);
            if ($expRf !== (int) $rf->row_version || $expMat !== (int) $rf->material_version || $expProg !== (int) $rf->progress_version) {
                return $this->outcomes->stale($chapterId, $this->rfRecordState($rf), 'STALE_RECORD_VERSION', 'Requisition version changed since preparation.');
            }
            if ($expStock !== $pos['position_version']) {
                return $this->outcomes->stale($chapterId, ChapterOutcomes::recordState((string) $pos['id'], 'STOCK_POSITION', $pos['position_version'], 1, ['guard_version' => (string) $pos['guard_version']]), 'STALE_STOCK_VERSION', 'Stock position changed since preparation; re-query eligibility.');
            }

            $qtyMicro = QuantityMath::dbToMicroString((string) $prep->quantity);
            $offMicro = QuantityMath::dbToMicroString((string) $prep->offset_qty);
            if (QuantityMath::cmp($qtyMicro, $this->unreservedLineMicro($chapterId, $line)) > 0) {
                return $this->outcomes->blocked($chapterId, 409, 'EXCEEDS_REMAINING_DEMAND', 'Remaining unreserved demand is now smaller than prepared quantity.');
            }

            $now = now()->format('Y-m-d H:i:s.u');
            $reserved = $this->inventory->reserveInterval($chapterId, (int) $line->item_variant_id, $pos['id'], $offMicro, $qtyMicro, "rf_prep:{$prep->id}", $now);
            if ($reserved === null) {
                return $this->outcomes->blocked($chapterId, 409, 'INTERVAL_NOT_FREE', 'Requested stock interval is no longer free.');
            }

            $scale = (int) $prep->unit_scale;
            $resId = DB::table('rf_reservations')->insertGetId([
                'chapter_id' => $chapterId, 'preparation_id' => (int) $prep->id, 'rf_id' => (int) $rf->id, 'rf_line_id' => (int) $line->id,
                'item_variant_id' => (int) $line->item_variant_id, 'stock_position_id' => $pos['id'], 'stock_lot_id' => $pos['stock_lot_id'],
                'offset_qty' => (string) $prep->offset_qty, 'committed_qty' => (string) $prep->quantity, 'active_qty' => (string) $prep->quantity,
                'fulfilled_qty' => '0.000000', 'released_qty' => '0.000000', 'unit_scale' => $scale, 'status' => 'active',
                'row_version' => 1, 'material_version' => (int) $rf->material_version, 'unpaid_expires_at' => null, 'reserved_at' => $now, 'updated_at' => $now,
            ]);
            foreach ($reserved['cell_ids'] as $cid) {
                DB::table('rf_reservation_cells')->insert(['chapter_id' => $chapterId, 'reservation_id' => $resId, 'stock_coverage_cell_id' => $cid, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
            }
            DB::table('rf_reservation_events')->insert(['chapter_id' => $chapterId, 'reservation_id' => $resId, 'event_code' => 'created', 'quantity' => (string) $prep->quantity, 'actor_user_id' => (int) $actor['user_id'], 'reason' => null, 'occurred_at' => $now]);
            DB::table('rf_reservation_preparations')->where('id', (int) $prep->id)->update(['state' => 'committed', 'reservation_id' => $resId, 'row_version' => (int) $prep->row_version + 1, 'updated_at' => $now]);
            $this->refreshRfProgress($chapterId, $rf, 'commitRfReservation', (int) $actor['user_id'], null, $now);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'rf.allocate_stock', $key, $hash, 'CommitRfRes@p07.v1',
                ChapterOutcomes::recordState((string) $resId, 'RF_RESERVATION', 1, (int) $rf->material_version, ['status' => 'active']),
                ['reservation' => [
                    'reservation_id' => (string) $resId, 'preparation_id' => (string) $prep->id, 'rf_id' => (string) $rf->id, 'rf_line_id' => (string) $line->id,
                    'lot_id' => (string) $pos['stock_lot_id'], 'stock_position_id' => (string) $pos['id'],
                    'committed_quantity' => QuantityMath::microToWireString($qtyMicro, $scale), 'active_quantity' => QuantityMath::microToWireString($qtyMicro, $scale),
                    'status' => 'active', 'version' => 1, 'material_version' => (int) $rf->material_version, 'expires_at' => null,
                ]], 201);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function releaseReservation(int $chapterId, array $actor, int $resId, string $key, array $in, ?int $rfIdScope = null): array
    {
        $reason = trim((string) ($in['reason'] ?? ''));
        if ($reason === '') {
            return $this->outcomes->blocked($chapterId, 422, 'REASON_REQUIRED', 'Release reason is required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'rf.release_reservation', 'ReleaseRfRes@p07.v1', ['res_id' => $resId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $resId, $rfIdScope, $key, $hash, $in, $reason): array {
            if (($r = $this->outcomes->replay($chapterId, 'rf.release_reservation', $key, $hash)) !== null) {
                return $r;
            }
            $peek = DB::table('rf_reservations')->where('chapter_id', $chapterId)->where('id', $resId)
                ->when($rfIdScope !== null, fn ($q) => $q->where('rf_id', $rfIdScope))->first();
            if ($peek === null) {
                return $this->outcomes->blocked($chapterId, 404, 'RESERVATION_NOT_FOUND', 'Reservation not found.');
            }
            $this->inventory->positionSnapshot($chapterId, (int) $peek->stock_position_id, true);
            $rf = DB::table('requisitions')->where('chapter_id', $chapterId)->where('id', (int) $peek->rf_id)->lockForUpdate()->first();
            $res = DB::table('rf_reservations')->where('id', $resId)->lockForUpdate()->first();

            if ($rf === null || $res === null || ! in_array((string) $res->status, ['active', 'blocked', 'partially_blocked'], true)) {
                return $this->outcomes->blocked($chapterId, 409, 'RESERVATION_NOT_ACTIVE', 'Reservation is not active.');
            }
            $expRes = (int) ($in['expected_row_version'] ?? ($in['expected_reservation_version'] ?? 0));
            if ($expRes !== (int) $res->row_version
                || (int) ($in['expected_rf_version'] ?? 0) !== (int) $rf->row_version
                || (int) ($in['expected_progress_version'] ?? 0) !== (int) $rf->progress_version) {
                return $this->outcomes->stale($chapterId, ChapterOutcomes::recordState((string) $res->id, 'RF_RESERVATION', (int) $res->row_version, (int) $res->material_version, ['status' => (string) $res->status]));
            }

            $now = now()->format('Y-m-d H:i:s.u');
            $this->releaseResRow($chapterId, $res, (int) $actor['user_id'], $reason, $now);
            $this->refreshRfProgress($chapterId, $rf, 'releaseRfReservation', (int) $actor['user_id'], $reason, $now);
            $newResVer = (int) $res->row_version + 1;

            return $this->outcomes->commitSuccess($chapterId, $actor, 'rf.release_reservation', $key, $hash, 'ReleaseRfRes@p07.v1',
                ChapterOutcomes::recordState((string) $res->id, 'RF_RESERVATION', $newResVer, (int) $res->material_version, ['status' => 'released']),
                ['reservation' => ['reservation_id' => (string) $res->id, 'status' => 'released', 'active_quantity' => '0', 'version' => $newResVer, 'expires_at' => null]]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function reallocateReservation(int $chapterId, array $actor, int $resId, string $key, array $in, ?int $rfIdScope = null): array
    {
        [$targetPosRaw, $targetOffRaw, $reason] = [(string) ($in['target_position_id'] ?? ''), (string) ($in['target_offset_value'] ?? '0'), trim((string) ($in['reason'] ?? ''))];
        if (preg_match('/^[1-9][0-9]{0,18}$/', $targetPosRaw) !== 1 || $reason === '') {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'target_position_id and reason are required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'rf.reallocate_reservation', 'ReallocRfRes@p07.v1', ['res_id' => $resId, 'in' => $in]);

        try {
            return DB::transaction(function () use ($chapterId, $actor, $resId, $rfIdScope, $key, $hash, $in, $targetPosRaw, $targetOffRaw, $reason): array {
                if (($r = $this->outcomes->replay($chapterId, 'rf.reallocate_reservation', $key, $hash)) !== null) {
                    return $r;
                }
                $peek = DB::table('rf_reservations')->where('chapter_id', $chapterId)->where('id', $resId)
                    ->when($rfIdScope !== null, fn ($q) => $q->where('rf_id', $rfIdScope))->first();
                if ($peek === null) {
                    return $this->outcomes->blocked($chapterId, 404, 'RESERVATION_NOT_FOUND', 'Reservation not found.');
                }
                $targetPosId = (int) $targetPosRaw;
                [$p1, $p2] = [(int) $peek->stock_position_id, $targetPosId];
                $tPos = null;
                foreach (array_unique([$p1 < $p2 ? $p1 : $p2, $p1 < $p2 ? $p2 : $p1]) as $pid) {
                    $snap = $this->inventory->positionSnapshot($chapterId, $pid, true);
                    if ($pid === $targetPosId) {
                        $tPos = $snap;
                    }
                }
                $rf = DB::table('requisitions')->where('chapter_id', $chapterId)->where('id', (int) $peek->rf_id)->lockForUpdate()->first();
                $res = DB::table('rf_reservations')->where('id', $resId)->lockForUpdate()->first();
                if ($rf === null || $res === null || $tPos === null || $tPos['item_variant_id'] !== (int) $res->item_variant_id) {
                    return $this->outcomes->blocked($chapterId, 404, 'TARGET_POSITION_NOT_FOUND', 'Target stock position for this variant not found.');
                }
                $expRes = (int) ($in['expected_row_version'] ?? ($in['expected_reservation_version'] ?? 0));
                if ($expRes !== (int) $res->row_version || (int) ($in['expected_rf_version'] ?? 0) !== (int) $rf->row_version) {
                    return $this->outcomes->stale($chapterId, ChapterOutcomes::recordState((string) $res->id, 'RF_RESERVATION', (int) $res->row_version, (int) $res->material_version, ['status' => (string) $res->status]));
                }
                $scale = (int) $res->unit_scale;
                $qtyMicro = QuantityMath::dbToMicroString((string) $res->active_qty);
                $offMicro = QuantityMath::toMicroString($targetOffRaw, $scale);

                $this->releaseResRow($chapterId, $res, (int) $actor['user_id'], $reason, $now = now()->format('Y-m-d H:i:s.u'));
                $reserved = $this->inventory->reserveInterval($chapterId, (int) $res->item_variant_id, $targetPosId, $offMicro, $qtyMicro, "rf_realloc:{$resId}", $now);
                if ($reserved === null) {
                    throw new RuntimeException('REALLOCATE_TARGET_CONFLICT');
                }
                $newResId = DB::table('rf_reservations')->insertGetId([
                    'chapter_id' => $chapterId, 'preparation_id' => null, 'rf_id' => (int) $rf->id, 'rf_line_id' => (int) $res->rf_line_id,
                    'item_variant_id' => (int) $res->item_variant_id, 'stock_position_id' => $targetPosId, 'stock_lot_id' => $tPos['stock_lot_id'],
                    'offset_qty' => QuantityMath::microToDbString($offMicro), 'committed_qty' => QuantityMath::microToDbString($qtyMicro), 'active_qty' => QuantityMath::microToDbString($qtyMicro),
                    'fulfilled_qty' => '0.000000', 'released_qty' => '0.000000', 'unit_scale' => $scale, 'status' => 'active',
                    'row_version' => 1, 'material_version' => (int) $rf->material_version, 'unpaid_expires_at' => null, 'reserved_at' => $now, 'updated_at' => $now,
                ]);
                foreach ($reserved['cell_ids'] as $cid) {
                    DB::table('rf_reservation_cells')->insert(['chapter_id' => $chapterId, 'reservation_id' => $newResId, 'stock_coverage_cell_id' => $cid, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now]);
                }
                DB::table('rf_reservation_events')->insert(['chapter_id' => $chapterId, 'reservation_id' => $newResId, 'event_code' => 'reallocated', 'quantity' => QuantityMath::microToDbString($qtyMicro), 'actor_user_id' => (int) $actor['user_id'], 'reason' => $reason, 'occurred_at' => $now]);
                $this->refreshRfProgress($chapterId, $rf, 'reallocateRfReservation', (int) $actor['user_id'], $reason, $now);

                return $this->outcomes->commitSuccess($chapterId, $actor, 'rf.reallocate_reservation', $key, $hash, 'ReallocRfRes@p07.v1',
                    ChapterOutcomes::recordState((string) $newResId, 'RF_RESERVATION', 1, (int) $rf->material_version, ['status' => 'active']),
                    ['reservation' => ['reservation_id' => (string) $newResId, 'stock_position_id' => (string) $targetPosId, 'status' => 'active', 'expires_at' => null]]);
            }, 3);
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'REALLOCATE_TARGET_CONFLICT') {
                return $this->outcomes->blocked($chapterId, 409, 'INTERVAL_NOT_FREE', 'Target interval is no longer free.');
            }

            throw $e;
        }
    }

    /** @param array<string, mixed> $actor */
    private function isUnitScoped(array $actor): bool
    {
        return ($actor['scope_kind'] ?? 'chapter') === 'unit'
            && ($actor['requesting_unit_id'] ?? null) !== null
            && array_intersect((array) ($actor['duties'] ?? []), self::CHAPTER_WIDE_DUTIES) === [];
    }

    /** @param array<string, mixed> $actor */
    private function canAccessRf(array $actor, object $rf): bool
    {
        return ! $this->isUnitScoped($actor) || (int) $rf->requesting_unit_id === (int) $actor['requesting_unit_id'];
    }

    private function normTs(mixed $v): ?string
    {
        return is_string($v) && trim($v) !== '' ? CarbonImmutable::parse($v)->utc()->format('Y-m-d H:i:s.u') : null;
    }

    /** @return array<string, mixed> */
    private function rfRecordState(object $rf): array
    {
        return ChapterOutcomes::recordState((string) $rf->id, 'RF', (int) $rf->row_version, (int) $rf->material_version, [
            'status' => (string) $rf->status, 'fulfillment_state' => (string) $rf->fulfillment_state, 'progress_version' => (string) $rf->progress_version,
        ]);
    }

    /** @param array<int, mixed> $raw
     * @return list<array{variant_id: int, scale: int, db_qty: string}>|array{http_status: int, body: array<string, mixed>} */
    private function parseLines(int $chapterId, array $raw, bool $allowEmpty): array
    {
        if (! $allowEmpty && $raw === []) {
            return $this->outcomes->blocked($chapterId, 422, 'EMPTY_REQUISITION_LINES', 'At least one requisition line is required.');
        }
        $out = [];
        foreach ($raw as $idx => $entry) {
            if (! is_array($entry) || preg_match('/^[1-9][0-9]{0,18}$/', (string) ($entry['variant_id'] ?? '')) !== 1) {
                return $this->outcomes->blocked($chapterId, 422, 'INVALID_LINE', 'Every line must specify a valid variant_id.', [['path' => "/lines/{$idx}/variant_id", 'code' => 'INVALID_LINE', 'message' => 'Valid variant_id required.']]);
            }
            $vid = (int) $entry['variant_id'];
            $scale = $this->inventory->variantScale($chapterId, $vid);
            if ($scale === null) {
                return $this->outcomes->blocked($chapterId, 404, 'VARIANT_NOT_FOUND', 'Catalog variant not found in chapter.');
            }
            if (isset($entry['quantity_scale']) && (int) $entry['quantity_scale'] !== $scale) {
                return $this->outcomes->blocked($chapterId, 422, 'INVALID_UNIT_PRECISION', "Submitted quantity_scale does not match unit scale {$scale}.");
            }
            try {
                $micro = QuantityMath::toMicroString((string) ($entry['requested_quantity_value'] ?? ''), $scale);
            } catch (InvalidArgumentException $e) {
                return $this->outcomes->blocked($chapterId, 422, 'INVALID_UNIT_PRECISION', $e->getMessage());
            }
            if (QuantityMath::cmp($micro, '0') <= 0) {
                return $this->outcomes->blocked($chapterId, 422, 'INVALID_QUANTITY', 'Requested line quantity must be strictly positive.');
            }
            $out[] = ['variant_id' => $vid, 'scale' => $scale, 'db_qty' => QuantityMath::microToDbString($micro)];
        }

        return $out;
    }

    private function validUnit(int $chapterId, mixed $raw): int|null|false
    {
        if ($raw === null || $raw === '') {
            return null;
        }

        return preg_match('/^[1-9][0-9]{0,18}$/', (string) $raw) === 1
            && DB::table('requesting_units')->where('chapter_id', $chapterId)->where('id', (int) $raw)->exists() ? (int) $raw : false;
    }

    private function unreservedLineMicro(int $chapterId, object $line): string
    {
        $app = QuantityMath::dbToMicroString((string) ($line->approved_qty ?? '0'));
        $used = QuantityMath::add(QuantityMath::dbToMicroString((string) $line->issued_qty), QuantityMath::dbToMicroString((string) $line->canceled_qty));
        $activeRes = '0';
        foreach (DB::table('rf_reservations')->where('chapter_id', $chapterId)->where('rf_line_id', (int) $line->id)->where('active_qty', '>', 0)->get() as $r) {
            $activeRes = QuantityMath::add($activeRes, QuantityMath::dbToMicroString((string) $r->active_qty));
        }
        $rem = QuantityMath::cmp($app, $used) > 0 ? QuantityMath::sub($app, $used) : '0';

        return QuantityMath::cmp($rem, $activeRes) > 0 ? QuantityMath::sub($rem, $activeRes) : '0';
    }

    private function releaseResRow(int $chapterId, object $res, int $userId, string $reason, string $now): void
    {
        $cells = DB::table('rf_reservation_cells')->where('chapter_id', $chapterId)->where('reservation_id', (int) $res->id)->where('is_active', true)->pluck('stock_coverage_cell_id')->map(fn ($i): int => (int) $i)->all();
        $refs = DB::table('stock_coverage_reservation_links')->where('chapter_id', $chapterId)->whereIn('stock_coverage_cell_id', $cells ?: [0])->pluck('reservation_ref')->all();
        foreach ($refs as $ref) {
            $this->inventory->releaseReservationByRef($chapterId, (int) $res->item_variant_id, (int) $res->stock_position_id, (string) $ref, $now);
        }
        if ($refs === [] && $cells !== []) {
            $this->inventory->releaseReservationByRef($chapterId, (int) $res->item_variant_id, (int) $res->stock_position_id, "rf_prep:{$res->preparation_id}", $now);
        }
        DB::table('rf_reservation_cells')->where('chapter_id', $chapterId)->where('reservation_id', (int) $res->id)->update(['is_active' => false, 'updated_at' => $now]);
        $active = (string) $res->active_qty;
        DB::table('rf_reservations')->where('id', (int) $res->id)->update([
            'status' => 'released', 'active_qty' => '0.000000',
            'released_qty' => QuantityMath::microToDbString(QuantityMath::add(QuantityMath::dbToMicroString((string) $res->released_qty), QuantityMath::dbToMicroString($active))),
            'row_version' => (int) $res->row_version + 1, 'updated_at' => $now,
        ]);
        DB::table('rf_reservation_events')->insert(['chapter_id' => $chapterId, 'reservation_id' => (int) $res->id, 'event_code' => 'released', 'quantity' => $active, 'actor_user_id' => $userId, 'reason' => $reason, 'occurred_at' => $now]);
    }

    private function refreshRfProgress(int $chapterId, object $rf, string $action, int $userId, ?string $reason, string $now): void
    {
        $lines = DB::table('requisition_lines')->where('chapter_id', $chapterId)->where('rf_id', (int) $rf->id)->get();
        [$anyRes, $allFull] = [false, true];
        foreach ($lines as $l) {
            $app = QuantityMath::dbToMicroString((string) ($l->approved_qty ?? '0'));
            $resSum = '0';
            foreach (DB::table('rf_reservations')->where('chapter_id', $chapterId)->where('rf_line_id', (int) $l->id)->get() as $r) {
                $resSum = QuantityMath::add($resSum, QuantityMath::dbToMicroString((string) $r->active_qty));
            }
            if (QuantityMath::cmp($resSum, '0') > 0) {
                $anyRes = true;
            }
            if (QuantityMath::cmp($resSum, $app) < 0) {
                $allFull = false;
            }
        }
        $fState = ! $anyRes ? 'unissued' : ($allFull ? 'fully_reserved' : 'partially_reserved');
        [$newVer, $newProg] = [(int) $rf->row_version + 1, (int) $rf->progress_version + 1];
        DB::table('requisitions')->where('id', (int) $rf->id)->update(['fulfillment_state' => $fState, 'row_version' => $newVer, 'progress_version' => $newProg, 'updated_at' => $now]);
        $this->logEvent($chapterId, (int) $rf->id, $newVer, (int) $rf->material_version, $newProg, $action, $userId, $reason, $now);
    }

    /** @return array<string, mixed> */
    private function loadRfDto(int $chapterId, int $rfId): array
    {
        $rf = DB::table('requisitions')->where('chapter_id', $chapterId)->where('id', $rfId)->first();
        $lines = DB::table('requisition_lines as rl')->join('item_variants as iv', 'iv.id', '=', 'rl.item_variant_id')->join('items as i', 'i.id', '=', 'iv.item_id')
            ->where('rl.chapter_id', $chapterId)->where('rl.rf_id', $rfId)->orderBy('rl.id')->select('rl.*', 'i.sku as variant_sku', 'i.name as item_name')->get()
            ->map(fn ($l): array => [
                'line_id' => (string) $l->id, 'variant_id' => (string) $l->item_variant_id, 'variant_sku' => (string) $l->variant_sku, 'item_name' => (string) $l->item_name,
                'requested_quantity' => QuantityMath::toUnitQuantity(QuantityMath::dbToMicroString((string) $l->requested_qty), (int) $l->unit_scale),
                'approved_quantity' => $l->approved_qty !== null ? QuantityMath::microToWireString(QuantityMath::dbToMicroString((string) $l->approved_qty), (int) $l->unit_scale) : null,
            ])->values()->all();

        return $this->formatRfHeader($rf, $lines);
    }

    /** @param list<array<string, mixed>> $lines
     * @return array<string, mixed> */
    private function formatRfHeader(object $rf, array $lines): array
    {
        return [
            'rf_id' => (string) $rf->id, 'chapter_id' => (string) $rf->chapter_id, 'reference' => $rf->reference,
            'requesting_unit_id' => $rf->requesting_unit_id !== null ? (string) $rf->requesting_unit_id : null,
            'requester_user_id' => (string) $rf->requester_user_id, 'purpose' => (string) $rf->purpose_kind,
            'needed_at' => $rf->needed_at, 'justification' => $rf->justification, 'status' => (string) $rf->status,
            'fulfillment_state' => (string) $rf->fulfillment_state, 'row_version' => (int) $rf->row_version,
            'material_version' => (int) $rf->material_version, 'progress_version' => (int) $rf->progress_version,
            'lines' => $lines,
            'approval' => $rf->approved_by_user_id !== null ? ['approver_user_id' => (string) $rf->approved_by_user_id,
                'duty_code' => (string) $rf->approved_duty_code, 'approved_material_version' => (int) $rf->approved_material_version, 'approved_at' => (string) $rf->approved_at] : null,
            'return_reason' => $rf->return_reason, 'cancel_reason' => $rf->cancel_reason, 'submitted_at' => $rf->submitted_at,
        ];
    }

    private function logEvent(int $cid, int $rfId, int $v, int $mv, int $pv, string $act, int $uid, ?string $reason, string $now): void
    {
        DB::table('requisition_events')->insert([
            'chapter_id' => $cid, 'rf_id' => $rfId, 'row_version' => $v, 'material_version' => $mv, 'progress_version' => $pv,
            'action' => $act, 'actor_user_id' => $uid, 'reason' => $reason, 'occurred_at' => $now,
        ]);
    }

    /** @param array<string, mixed> $elig */
    private function isPosEligible(array $elig, int $posId): bool
    {
        if (! ($elig['body']['policy_gate']['approved'] ?? false)) {
            return false;
        }
        foreach ((array) ($elig['body']['positions'] ?? []) as $p) {
            if (is_array($p) && (string) ($p['stock_position_id'] ?? '') === (string) $posId) {
                return (bool) ($p['eligible'] ?? false);
            }
        }

        return false;
    }
}
