<?php

declare(strict_types=1);

namespace App\Modules\SalesFinance;

use App\Modules\DocumentsReporting\ChapterOutcomes;
use App\Modules\InventoryCustody\InventoryLedgerParticipant;
use App\Modules\InventoryCustody\QuantityMath;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Phase 3 (P12) Sales Order intake, dual-control review, split/buyer-acceptance, and non-payment Sales Invoice.
 */
final class SalesOrderService
{
    public function __construct(
        private InventoryLedgerParticipant $inventory,
        private ChapterOutcomes $outcomes,
    ) {}

    /** @param array<string, mixed> $query
     * @return array{http_status: int, body: array<string, mixed>} */
    public function snapshot(int $chapterId, array $query = []): array
    {
        $cur = $this->outcomes->parseCursor($chapterId, 'sales.list', $query);
        if (! $cur['ok']) {
            return $cur['error'];
        }
        $q = DB::table('sales_orders')->where('chapter_id', $chapterId);
        if ($cur['after_id'] > 0) {
            $q->where('id', '>', $cur['after_id']);
        }
        $rows = $q->orderBy('id')->limit($cur['limit'] + 1)->get()->all();
        $hasMore = count($rows) > $cur['limit'];
        $slice = $hasMore ? array_slice($rows, 0, $cur['limit']) : $rows;
        $nextCursor = $hasMore ? ($cur['encode_cursor'])((int) end($slice)->id) : null;

        $orders = array_map(fn (object $so): array => $this->soDto($so), $slice);
        $warehouse = $this->inventory->warehouseSummaries($chapterId);
        $pools = DB::table('sale_stock_pools')->where('chapter_id', $chapterId)->orderBy('item_variant_id')->get()->map(function (object $p) use ($warehouse): array {
            $vid = (int) $p->item_variant_id;
            $s = (int) $p->unit_scale;
            $w = $warehouse[$vid] ?? ['on_hand' => '0', 'rf' => '0'];
            $unpaid = QuantityMath::dbToMicroString((string) $p->so_unpaid_reserved_qty);
            $paid = QuantityMath::dbToMicroString((string) $p->so_paid_reserved_qty);
            $free = QuantityMath::sub($w['on_hand'], QuantityMath::add($w['rf'], QuantityMath::add($unpaid, $paid)));

            return [
                'variant_id' => (string) $vid, 'unit_price' => (string) $p->unit_price, 'max_discount_amount' => (string) $p->max_discount_amount,
                'row_version' => (int) $p->row_version,
                'usable_on_hand' => QuantityMath::microToWireString($w['on_hand'], $s),
                'rf_reserved' => QuantityMath::microToWireString($w['rf'], $s),
                'so_unpaid_reserved' => QuantityMath::microToWireString($unpaid, $s),
                'so_paid_reserved' => QuantityMath::microToWireString($paid, $s),
                'available_to_allocate' => QuantityMath::microToWireString(QuantityMath::cmp($free, '0') > 0 ? $free : '0', $s),
            ];
        })->values()->all();

        $invoices = DB::table('sales_invoices')->where('chapter_id', $chapterId)->orderBy('id')->get()->map(fn (object $i): array => [
            'si_id' => (string) $i->id, 'si_reference' => (string) $i->si_reference, 'so_id' => (string) $i->so_id,
            'net_amount_due' => (string) $i->net_amount_due, 'is_proof_of_payment' => false, 'release_authority_granted' => false, 'issued_at' => (string) $i->issued_at,
        ])->values()->all();

        return ['http_status' => 200, 'body' => [
            'chapter_id' => (string) $chapterId, 'orders' => $orders, 'items' => $orders, 'next_cursor' => $nextCursor,
            'pools' => $pools, 'invoices' => $invoices,
        ]];
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function configurePool(int $chapterId, array $actor, string $key, array $in): array
    {
        $vidRaw = (string) ($in['variant_id'] ?? '');
        if (preg_match('/^[1-9][0-9]{0,18}$/', $vidRaw) !== 1 || ! is_numeric($in['unit_price'] ?? null) || ! is_numeric($in['max_discount_amount'] ?? null)) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'variant_id, unit_price, and max_discount_amount are required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'sales.configure_pool', 'ConfigPool@p12.v1', $in);

        return DB::transaction(function () use ($chapterId, $actor, $key, $hash, $in, $vidRaw): array {
            if (($r = $this->outcomes->replay($chapterId, 'sales.configure_pool', $key, $hash)) !== null) {
                return $r;
            }
            $vid = (int) $vidRaw;
            $scale = $this->inventory->variantScale($chapterId, $vid);
            if ($scale === null) {
                return $this->outcomes->blocked($chapterId, 404, 'VARIANT_NOT_FOUND', 'Variant not found in chapter.');
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $price = QuantityMath::fromCents(QuantityMath::toCents((string) $in['unit_price']));
            $disc = QuantityMath::fromCents(QuantityMath::toCents((string) $in['max_discount_amount']));
            $existing = DB::table('sale_stock_pools')->where('chapter_id', $chapterId)->where('item_variant_id', $vid)->lockForUpdate()->first();

            if ($existing === null) {
                $poolId = DB::table('sale_stock_pools')->insertGetId([
                    'chapter_id' => $chapterId, 'item_variant_id' => $vid, 'unit_scale' => $scale,
                    'unit_price' => $price, 'max_discount_amount' => $disc, 'row_version' => 1, 'updated_at' => $now,
                ]);
                $ver = 1;
            } else {
                if (isset($in['expected_row_version']) && (int) $in['expected_row_version'] !== (int) $existing->row_version) {
                    return $this->outcomes->stale($chapterId, ChapterOutcomes::recordState((string) $existing->id, 'SO_POOL', (int) $existing->row_version, 1, []));
                }
                $poolId = (int) $existing->id;
                $ver = (int) $existing->row_version + 1;
                DB::table('sale_stock_pools')->where('id', $poolId)->update(['unit_price' => $price, 'max_discount_amount' => $disc, 'row_version' => $ver, 'updated_at' => $now]);
            }

            return $this->outcomes->commitSuccess($chapterId, $actor, 'sales.configure_pool', $key, $hash, 'ConfigPool@p12.v1',
                ChapterOutcomes::recordState((string) $poolId, 'SO_POOL', $ver, 1, ['variant_id' => (string) $vid]),
                ['pool' => ['pool_id' => (string) $poolId, 'variant_id' => (string) $vid, 'unit_price' => $price, 'max_discount_amount' => $disc, 'row_version' => $ver]],
                $existing === null ? 201 : 200);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function createDraft(int $chapterId, array $actor, string $key, array $in): array
    {
        [$vidRaw, $buyer, $contact, $terms, $arr] = [
            (string) ($in['variant_id'] ?? ''), trim((string) ($in['buyer_name'] ?? '')), trim((string) ($in['buyer_contact'] ?? '')),
            trim((string) ($in['payment_terms'] ?? '')), (string) ($in['fulfillment_arrangement'] ?? ''),
        ];
        if (preg_match('/^[1-9][0-9]{0,18}$/', $vidRaw) !== 1 || $buyer === '' || $contact === '' || $terms === '' || ! in_array($arr, ['pickup', 'delivery'], true)) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'variant_id, buyer details, payment_terms, and valid fulfillment_arrangement are required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'sales.create_draft', 'CreateSo@p12.v1', $in);

        return DB::transaction(function () use ($chapterId, $actor, $key, $hash, $in, $vidRaw, $buyer, $contact, $terms, $arr): array {
            if (($r = $this->outcomes->replay($chapterId, 'sales.create_draft', $key, $hash)) !== null) {
                return $r;
            }
            $vid = (int) $vidRaw;
            $scale = $this->inventory->variantScale($chapterId, $vid);
            if ($scale === null) {
                return $this->outcomes->blocked($chapterId, 404, 'VARIANT_NOT_FOUND', 'Variant not found in chapter.');
            }
            if (isset($in['quantity_scale']) && (int) $in['quantity_scale'] !== $scale) {
                return $this->outcomes->blocked($chapterId, 422, 'INVALID_UNIT_PRECISION', "Submitted quantity_scale does not match unit scale {$scale}.");
            }
            try {
                $qtyMicro = QuantityMath::toMicroString((string) ($in['ordered_quantity_value'] ?? '0'), $scale);
            } catch (InvalidArgumentException $e) {
                return $this->outcomes->blocked($chapterId, 422, 'INVALID_UNIT_PRECISION', $e->getMessage());
            }
            if (QuantityMath::cmp($qtyMicro, '0') <= 0) {
                return $this->outcomes->blocked($chapterId, 422, 'INVALID_QUANTITY', 'Ordered quantity must be positive.');
            }

            $price = QuantityMath::fromCents(QuantityMath::toCents((string) ($in['unit_price'] ?? '0.00')));
            $disc = QuantityMath::fromCents(QuantityMath::toCents((string) ($in['discount_amount'] ?? '0.00')));
            $estCost = QuantityMath::fromCents(QuantityMath::toCents((string) ($in['estimated_procurement_cost'] ?? '0.00')));
            $net = $this->netAmount($qtyMicro, $price, $disc);
            $now = now()->format('Y-m-d H:i:s.u');
            $reqAt = isset($in['requested_at']) ? CarbonImmutable::parse((string) $in['requested_at'], 'UTC')->format('Y-m-d H:i:s.u') : $now;
            $pickupAt = isset($in['pickup_deadline_at']) ? CarbonImmutable::parse((string) $in['pickup_deadline_at'], 'UTC')->format('Y-m-d H:i:s.u') : null;

            $soId = DB::table('sales_orders')->insertGetId([
                'chapter_id' => $chapterId, 'sales_officer_user_id' => (int) $actor['user_id'], 'buyer_name' => $buyer, 'buyer_contact' => $contact,
                'item_variant_id' => $vid, 'unit_scale' => $scale, 'ordered_qty' => QuantityMath::microToDbString($qtyMicro),
                'unit_price' => $price, 'discount_amount' => $disc, 'net_amount_due' => $net, 'estimated_procurement_cost' => $estCost,
                'payment_terms' => $terms, 'requested_at' => $reqAt, 'fulfillment_arrangement' => $arr, 'pickup_deadline_at' => $pickupAt,
                'status' => 'draft', 'row_version' => 1, 'material_version' => 1, 'created_at' => $now, 'updated_at' => $now,
            ]);
            $this->logEvent($chapterId, $soId, 1, 1, 'createSalesOrderDraft', (int) $actor['user_id'], null, $now);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'sales.create_draft', $key, $hash, 'CreateSo@p12.v1',
                ChapterOutcomes::recordState((string) $soId, 'SO', 1, 1, ['status' => 'draft', 'unpaid_available_state' => 'none', 'backorder_state' => 'none']),
                ['order' => $this->loadDto($chapterId, $soId)], 201);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function submit(int $chapterId, array $actor, int $soId, string $key, array $in): array
    {
        $hash = ChapterOutcomes::fingerprint($chapterId, 'sales.submit', 'SubmitSo@p12.v1', ['so_id' => $soId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $soId, $key, $hash, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'sales.submit', $key, $hash)) !== null) {
                return $r;
            }
            $so = DB::table('sales_orders')->where('chapter_id', $chapterId)->where('id', $soId)->lockForUpdate()->first();
            if ($so === null) {
                return $this->outcomes->blocked($chapterId, 404, 'SO_NOT_FOUND', 'Sales order not found.');
            }
            if (! in_array((string) $so->status, ['draft', 'returned'], true)) {
                return $this->outcomes->blocked($chapterId, 409, 'INVALID_TRANSITION', 'Sales order must be draft or returned to submit.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $so->row_version) {
                return $this->outcomes->stale($chapterId, $this->soRecordState($so));
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $newVer = (int) $so->row_version + 1;
            $ref = $so->reference ?: sprintf('%s-SO-2026-%05d', (string) ($actor['chapter_code'] ?? 'CH'), $soId);
            DB::table('sales_orders')->where('id', $soId)->update(['status' => 'pending_review', 'reference' => $ref, 'return_reason' => null, 'row_version' => $newVer, 'updated_at' => $now]);
            $this->logEvent($chapterId, $soId, $newVer, (int) $so->material_version, 'submitSalesOrder', (int) $actor['user_id'], null, $now);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'sales.submit', $key, $hash, 'SubmitSo@p12.v1',
                ChapterOutcomes::recordState((string) $soId, 'SO', $newVer, (int) $so->material_version, ['status' => 'pending_review', 'unpaid_available_state' => (string) $so->unpaid_available_state, 'backorder_state' => (string) $so->backorder_state]),
                ['order' => $this->loadDto($chapterId, $soId)]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function approve(int $chapterId, array $actor, int $soId, string $key, array $in): array
    {
        $hash = ChapterOutcomes::fingerprint($chapterId, 'sales.approve', 'ApproveSo@p12.v1', ['so_id' => $soId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $soId, $key, $hash, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'sales.approve', $key, $hash)) !== null) {
                return $r;
            }
            $so = DB::table('sales_orders')->where('chapter_id', $chapterId)->where('id', $soId)->lockForUpdate()->first();
            if ($so === null) {
                return $this->outcomes->blocked($chapterId, 404, 'SO_NOT_FOUND', 'Sales order not found.');
            }
            if ((string) $so->status !== 'pending_review') {
                return $this->outcomes->blocked($chapterId, 409, 'INVALID_TRANSITION', 'Sales order must be pending_review.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $so->row_version
                || ! is_int($in['expected_material_version'] ?? null) || (int) $in['expected_material_version'] !== (int) $so->material_version) {
                return $this->outcomes->stale($chapterId, $this->soRecordState($so));
            }
            if ((int) $so->sales_officer_user_id === (int) $actor['user_id']) {
                return $this->outcomes->forbidden('SELF_APPROVAL_FORBIDDEN', 'GOV-05: Sales officer cannot review their own sales order.');
            }

            $pool = DB::table('sale_stock_pools')->where('chapter_id', $chapterId)->where('item_variant_id', (int) $so->item_variant_id)->first();
            $override = (bool) ($in['approve_price_override'] ?? false);
            if ($pool !== null && (QuantityMath::toCents((string) $so->discount_amount) > QuantityMath::toCents((string) $pool->max_discount_amount)
                || QuantityMath::toCents((string) $so->unit_price) < QuantityMath::toCents((string) $pool->unit_price)) && ! $override) {
                return $this->outcomes->blocked($chapterId, 422, 'DISCOUNT_EXCEEDS_LIMIT', 'Price/discount violates published pool pricing without explicit reviewer override.');
            }

            $now = now()->format('Y-m-d H:i:s.u');
            $duty = in_array('CHAPTER_HEAD', (array) $actor['duties'], true) ? 'CHAPTER_HEAD' : 'SALES_REVIEWER';
            $newVer = (int) $so->row_version + 1;
            DB::table('sales_orders')->where('id', $soId)->update([
                'status' => 'approved', 'reviewer_user_id' => (int) $actor['user_id'], 'reviewer_duty_code' => $duty,
                'approved_material_version' => (int) $so->material_version, 'price_override_approved' => $override,
                'approved_at' => $now, 'row_version' => $newVer, 'updated_at' => $now,
            ]);
            $this->logEvent($chapterId, $soId, $newVer, (int) $so->material_version, 'approveSalesOrder', (int) $actor['user_id'], null, $now);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'sales.approve', $key, $hash, 'ApproveSo@p12.v1',
                ChapterOutcomes::recordState((string) $soId, 'SO', $newVer, (int) $so->material_version, ['status' => 'approved', 'unpaid_available_state' => (string) $so->unpaid_available_state, 'backorder_state' => (string) $so->backorder_state]),
                ['order' => $this->loadDto($chapterId, $soId)]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function returnOrder(int $chapterId, array $actor, int $soId, string $key, array $in): array
    {
        $reason = trim((string) ($in['reason'] ?? ''));
        if ($reason === '') {
            return $this->outcomes->blocked($chapterId, 422, 'REASON_REQUIRED', 'Return reason is required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'sales.return_order', 'ReturnSo@p12.v1', ['so_id' => $soId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $soId, $key, $hash, $in, $reason): array {
            if (($r = $this->outcomes->replay($chapterId, 'sales.return_order', $key, $hash)) !== null) {
                return $r;
            }
            $so = DB::table('sales_orders')->where('chapter_id', $chapterId)->where('id', $soId)->lockForUpdate()->first();
            if ($so === null || (string) $so->status !== 'pending_review') {
                return $this->outcomes->blocked($chapterId, 409, 'INVALID_TRANSITION', 'Sales order must be pending_review to return.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $so->row_version
                || ! is_int($in['expected_material_version'] ?? null) || (int) $in['expected_material_version'] !== (int) $so->material_version) {
                return $this->outcomes->stale($chapterId, $this->soRecordState($so));
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $newVer = (int) $so->row_version + 1;
            DB::table('sales_orders')->where('id', $soId)->update(['status' => 'returned', 'return_reason' => $reason, 'row_version' => $newVer, 'updated_at' => $now]);
            $this->logEvent($chapterId, $soId, $newVer, (int) $so->material_version, 'returnSalesOrder', (int) $actor['user_id'], $reason, $now);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'sales.return_order', $key, $hash, 'ReturnSo@p12.v1',
                ChapterOutcomes::recordState((string) $soId, 'SO', $newVer, (int) $so->material_version, ['status' => 'returned']),
                ['order' => $this->loadDto($chapterId, $soId)]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function revise(int $chapterId, array $actor, int $soId, string $key, array $in): array
    {
        $reason = trim((string) ($in['reason'] ?? ''));
        if ($reason === '') {
            return $this->outcomes->blocked($chapterId, 422, 'REASON_REQUIRED', 'Revision reason is required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'sales.revise', 'ReviseSo@p12.v1', ['so_id' => $soId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $soId, $key, $hash, $in, $reason): array {
            if (($r = $this->outcomes->replay($chapterId, 'sales.revise', $key, $hash)) !== null) {
                return $r;
            }
            $so = DB::table('sales_orders')->where('chapter_id', $chapterId)->where('id', $soId)->lockForUpdate()->first();
            if ($so === null) {
                return $this->outcomes->blocked($chapterId, 404, 'SO_NOT_FOUND', 'Sales order not found.');
            }
            if ((string) $so->status === 'canceled') {
                return $this->outcomes->blocked($chapterId, 409, 'SO_CANCELED', 'Canceled sales order cannot be revised.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $so->row_version
                || (int) ($in['expected_material_version'] ?? 0) !== (int) $so->material_version) {
                return $this->outcomes->stale($chapterId, $this->soRecordState($so));
            }
            if (QuantityMath::cmp(QuantityMath::dbToMicroString((string) $so->reserved_available_qty), '0') > 0
                || QuantityMath::cmp(QuantityMath::dbToMicroString((string) $so->paid_available_qty), '0') > 0) {
                return $this->outcomes->blocked($chapterId, 409, 'ACTIVE_RESERVATION_EXCEEDS_REVISION', 'Release active SO stock reservations before materially revising.');
            }

            $s = (int) $so->unit_scale;
            $qtyMicro = isset($in['ordered_quantity_value']) ? QuantityMath::toMicroString((string) $in['ordered_quantity_value'], $s) : QuantityMath::dbToMicroString((string) $so->ordered_qty);
            $price = isset($in['unit_price']) ? QuantityMath::fromCents(QuantityMath::toCents((string) $in['unit_price'])) : (string) $so->unit_price;
            $disc = isset($in['discount_amount']) ? QuantityMath::fromCents(QuantityMath::toCents((string) $in['discount_amount'])) : (string) $so->discount_amount;
            $now = now()->format('Y-m-d H:i:s.u');
            [$newVer, $newMat] = [(int) $so->row_version + 1, (int) $so->material_version + 1];

            DB::table('sales_orders')->where('id', $soId)->update([
                'ordered_qty' => QuantityMath::microToDbString($qtyMicro), 'unit_price' => $price, 'discount_amount' => $disc,
                'net_amount_due' => $this->netAmount($qtyMicro, $price, $disc),
                'status' => 'draft', 'reviewer_user_id' => null, 'reviewer_duty_code' => null, 'approved_material_version' => null, 'approved_at' => null,
                'price_override_approved' => false, 'return_reason' => null, 'row_version' => $newVer, 'material_version' => $newMat, 'updated_at' => $now,
            ]);
            $this->logEvent($chapterId, $soId, $newVer, $newMat, 'reviseSalesOrder', (int) $actor['user_id'], $reason, $now);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'sales.revise', $key, $hash, 'ReviseSo@p12.v1',
                ChapterOutcomes::recordState((string) $soId, 'SO', $newVer, $newMat, ['status' => 'draft']),
                ['order' => $this->loadDto($chapterId, $soId)]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function cancel(int $chapterId, array $actor, int $soId, string $key, array $in): array
    {
        $reason = trim((string) ($in['reason'] ?? ''));
        if ($reason === '') {
            return $this->outcomes->blocked($chapterId, 422, 'REASON_REQUIRED', 'Cancellation reason is required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'sales.cancel', 'CancelSo@p12.v1', ['so_id' => $soId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $soId, $key, $hash, $in, $reason): array {
            if (($r = $this->outcomes->replay($chapterId, 'sales.cancel', $key, $hash)) !== null) {
                return $r;
            }
            $so = DB::table('sales_orders')->where('chapter_id', $chapterId)->where('id', $soId)->lockForUpdate()->first();
            if ($so === null) {
                return $this->outcomes->blocked($chapterId, 404, 'SO_NOT_FOUND', 'Sales order not found.');
            }
            if ((string) $so->status === 'canceled') {
                return $this->outcomes->blocked($chapterId, 409, 'SO_ALREADY_CANCELED', 'Sales order is already canceled.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $so->row_version) {
                return $this->outcomes->stale($chapterId, $this->soRecordState($so));
            }
            $now = now()->format('Y-m-d H:i:s.u');
            if ((string) $so->unpaid_available_state === 'active_unpaid') {
                $rel = QuantityMath::dbToMicroString((string) $so->reserved_available_qty);
                $pool = DB::table('sale_stock_pools')->where('chapter_id', $chapterId)->where('item_variant_id', (int) $so->item_variant_id)->lockForUpdate()->first();
                if ($pool !== null && QuantityMath::cmp($rel, '0') > 0) {
                    $cur = QuantityMath::dbToMicroString((string) $pool->so_unpaid_reserved_qty);
                    DB::table('sale_stock_pools')->where('id', (int) $pool->id)->update([
                        'so_unpaid_reserved_qty' => QuantityMath::microToDbString(QuantityMath::cmp($cur, $rel) > 0 ? QuantityMath::sub($cur, $rel) : '0'),
                        'row_version' => (int) $pool->row_version + 1, 'updated_at' => $now,
                    ]);
                }
            }
            $newVer = (int) $so->row_version + 1;
            DB::table('sales_orders')->where('id', $soId)->update([
                'status' => 'canceled', 'cancel_reason' => $reason,
                'unpaid_available_state' => (string) $so->unpaid_available_state === 'active_unpaid' ? 'expired_released' : $so->unpaid_available_state,
                'row_version' => $newVer, 'updated_at' => $now,
            ]);
            $this->logEvent($chapterId, $soId, $newVer, (int) $so->material_version, 'cancelSalesOrder', (int) $actor['user_id'], $reason, $now);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'sales.cancel', $key, $hash, 'CancelSo@p12.v1',
                ChapterOutcomes::recordState((string) $soId, 'SO', $newVer, (int) $so->material_version, ['status' => 'canceled']),
                ['order' => $this->loadDto($chapterId, $soId)]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function split(int $chapterId, array $actor, int $soId, string $key, array $in): array
    {
        $hash = ChapterOutcomes::fingerprint($chapterId, 'sales.split', 'SplitSo@p12.v1', ['so_id' => $soId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $soId, $key, $hash, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'sales.split', $key, $hash)) !== null) {
                return $r;
            }
            $peek = DB::table('sales_orders')->where('chapter_id', $chapterId)->where('id', $soId)->first();
            if ($peek === null) {
                return $this->outcomes->blocked($chapterId, 404, 'SO_NOT_FOUND', 'Sales order not found.');
            }
            $wh = $this->inventory->lockVariantAndReadWarehouse($chapterId, (int) $peek->item_variant_id);
            $pool = DB::table('sale_stock_pools')->where('chapter_id', $chapterId)->where('item_variant_id', (int) $peek->item_variant_id)->lockForUpdate()->first();
            $so = DB::table('sales_orders')->where('id', $soId)->lockForUpdate()->first();

            if ($wh === null || (string) $so->status !== 'approved') {
                return $this->outcomes->blocked($chapterId, 409, 'SO_NOT_APPROVED', 'Sales order must be approved before splitting and reserving available stock.');
            }
            if ((bool) $so->split_completed) {
                return $this->outcomes->blocked($chapterId, 409, 'SO_ALREADY_SPLIT', 'Sales order has already been split.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $so->row_version) {
                return $this->outcomes->stale($chapterId, $this->soRecordState($so));
            }

            $soUnpaid = $pool ? QuantityMath::dbToMicroString((string) $pool->so_unpaid_reserved_qty) : '0';
            $soPaid = $pool ? QuantityMath::dbToMicroString((string) $pool->so_paid_reserved_qty) : '0';
            $used = QuantityMath::add($wh['rf'], QuantityMath::add($soUnpaid, $soPaid));
            $free = QuantityMath::cmp($wh['on_hand'], $used) > 0 ? QuantityMath::sub($wh['on_hand'], $used) : '0';

            $ord = QuantityMath::dbToMicroString((string) $so->ordered_qty);
            $availSplit = QuantityMath::min($ord, $free);
            $shortage = QuantityMath::sub($ord, $availSplit);

            $now = now()->format('Y-m-d H:i:s.u');
            $at = isset($in['occurred_at']) ? CarbonImmutable::parse((string) $in['occurred_at'], 'UTC') : CarbonImmutable::parse($now, 'UTC');
            $c1Start = QuantityMath::cmp($availSplit, '0') > 0 ? $at->format('Y-m-d H:i:s.u') : null;
            $c1Exp = QuantityMath::cmp($availSplit, '0') > 0 ? $at->addHours(48)->format('Y-m-d H:i:s.u') : null;
            $uState = QuantityMath::cmp($availSplit, '0') > 0 ? 'active_unpaid' : 'none';

            if (QuantityMath::cmp($availSplit, '0') > 0) {
                $newPoolUnpaid = QuantityMath::microToDbString(QuantityMath::add($soUnpaid, $availSplit));
                if ($pool === null) {
                    DB::table('sale_stock_pools')->insert([
                        'chapter_id' => $chapterId, 'item_variant_id' => (int) $so->item_variant_id, 'unit_scale' => (int) $so->unit_scale,
                        'unit_price' => (string) $so->unit_price, 'max_discount_amount' => '0.00',
                        'so_unpaid_reserved_qty' => $newPoolUnpaid, 'row_version' => 1, 'updated_at' => $now,
                    ]);
                } else {
                    DB::table('sale_stock_pools')->where('id', (int) $pool->id)->update([
                        'so_unpaid_reserved_qty' => $newPoolUnpaid, 'row_version' => (int) $pool->row_version + 1, 'updated_at' => $now,
                    ]);
                }
            }

            $newVer = (int) $so->row_version + 1;
            DB::table('sales_orders')->where('id', $soId)->update([
                'reserved_available_qty' => QuantityMath::microToDbString($availSplit),
                'backorder_shortage_qty' => QuantityMath::microToDbString($shortage),
                'split_completed' => true, 'unpaid_available_state' => $uState,
                'available_reservation_created_at' => $c1Start, 'available_reservation_expires_at' => $c1Exp,
                'row_version' => $newVer, 'updated_at' => $now,
            ]);
            $this->logEvent($chapterId, $soId, $newVer, (int) $so->material_version, 'splitSalesOrder', (int) $actor['user_id'], null, $now);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'sales.split', $key, $hash, 'SplitSo@p12.v1',
                ChapterOutcomes::recordState((string) $soId, 'SO', $newVer, (int) $so->material_version, ['status' => 'approved', 'unpaid_available_state' => $uState, 'backorder_state' => (string) $so->backorder_state]),
                ['order' => $this->loadDto($chapterId, $soId)]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function buyerAcceptance(int $chapterId, array $actor, int $soId, string $key, array $in): array
    {
        [$dec, $chan, $outc] = [(string) ($in['decision'] ?? ''), trim((string) ($in['contact_channel'] ?? 'phone')), trim((string) ($in['contact_outcome'] ?? 'confirmed'))];
        if (! in_array($dec, ['accept_all', 'accept_available_only', 'decline_all'], true) || $chan === '' || $outc === '') {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'decision (accept_all|accept_available_only|decline_all), contact_channel, and contact_outcome are required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'sales.buyer_acceptance', 'BuyerAccept@p12.v1', ['so_id' => $soId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $soId, $key, $hash, $in, $dec, $chan, $outc): array {
            if (($r = $this->outcomes->replay($chapterId, 'sales.buyer_acceptance', $key, $hash)) !== null) {
                return $r;
            }
            $so = DB::table('sales_orders')->where('chapter_id', $chapterId)->where('id', $soId)->lockForUpdate()->first();
            if ($so === null || ! (bool) $so->split_completed) {
                return $this->outcomes->blocked($chapterId, 409, 'SO_NOT_SPLIT', 'Sales order must complete stock availability split first.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $so->row_version) {
                return $this->outcomes->stale($chapterId, $this->soRecordState($so));
            }

            $now = now()->format('Y-m-d H:i:s.u');
            $at = isset($in['occurred_at']) ? CarbonImmutable::parse((string) $in['occurred_at'], 'UTC') : CarbonImmutable::parse($now, 'UTC');
            $short = QuantityMath::dbToMicroString((string) $so->backorder_shortage_qty);
            $upd = ['buyer_acceptance_decision' => $dec, 'buyer_contact_channel' => $chan, 'buyer_contact_outcome' => $outc, 'row_version' => (int) $so->row_version + 1, 'updated_at' => $now];

            if ($dec === 'accept_all' && QuantityMath::cmp($short, '0') > 0) {
                $upd += ['accepted_backorder_qty' => (string) $so->backorder_shortage_qty, 'declined_shortage_qty' => '0.000000',
                    'backorder_state' => 'awaiting_deposit', 'backorder_accepted_at' => $at->format('Y-m-d H:i:s.u'),
                    'backorder_deposit_expires_at' => $at->addHours(48)->format('Y-m-d H:i:s.u')];
            } elseif ($dec === 'accept_available_only') {
                $upd += ['accepted_backorder_qty' => '0.000000', 'declined_shortage_qty' => (string) $so->backorder_shortage_qty, 'backorder_state' => 'none'];
            } else {
                $rel = QuantityMath::dbToMicroString((string) $so->reserved_available_qty);
                $pool = DB::table('sale_stock_pools')->where('chapter_id', $chapterId)->where('item_variant_id', (int) $so->item_variant_id)->lockForUpdate()->first();
                if ($pool !== null && QuantityMath::cmp($rel, '0') > 0) {
                    $cur = QuantityMath::dbToMicroString((string) $pool->so_unpaid_reserved_qty);
                    DB::table('sale_stock_pools')->where('id', (int) $pool->id)->update([
                        'so_unpaid_reserved_qty' => QuantityMath::microToDbString(QuantityMath::cmp($cur, $rel) > 0 ? QuantityMath::sub($cur, $rel) : '0'),
                        'row_version' => (int) $pool->row_version + 1, 'updated_at' => $now,
                    ]);
                }
                $upd += ['status' => 'canceled', 'cancel_reason' => 'buyer_declined_all', 'unpaid_available_state' => 'expired_released',
                    'accepted_backorder_qty' => '0.000000', 'declined_shortage_qty' => (string) $so->backorder_shortage_qty];
            }
            DB::table('sales_orders')->where('id', $soId)->update($upd);
            $this->logEvent($chapterId, $soId, (int) $upd['row_version'], (int) $so->material_version, "buyerAcceptance:{$dec}", (int) $actor['user_id'], null, $now);

            $dto = $this->loadDto($chapterId, $soId);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'sales.buyer_acceptance', $key, $hash, 'BuyerAccept@p12.v1',
                ChapterOutcomes::recordState((string) $soId, 'SO', (int) $dto['row_version'], (int) $dto['material_version'], ['status' => (string) $dto['status'], 'backorder_state' => (string) $dto['backorder_state']]),
                ['order' => $dto]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function issueInvoice(int $chapterId, array $actor, int $soId, string $key, array $in): array
    {
        $hash = ChapterOutcomes::fingerprint($chapterId, 'sales.issue_invoice', 'IssueSi@p12.v1', ['so_id' => $soId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $soId, $key, $hash, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'sales.issue_invoice', $key, $hash)) !== null) {
                return $r;
            }
            $so = DB::table('sales_orders')->where('chapter_id', $chapterId)->where('id', $soId)->lockForUpdate()->first();
            if ($so === null || (string) $so->status !== 'approved') {
                return $this->outcomes->blocked($chapterId, 409, 'SO_NOT_APPROVED', 'Sales order must be approved to issue a billing invoice.');
            }
            if ($so->si_reference !== null) {
                return $this->outcomes->blocked($chapterId, 409, 'SI_ALREADY_ISSUED', 'Sales Invoice already issued for this order.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $so->row_version) {
                return $this->outcomes->stale($chapterId, $this->soRecordState($so));
            }

            $now = now()->format('Y-m-d H:i:s.u');
            $issuedAt = isset($in['issued_at']) ? CarbonImmutable::parse((string) $in['issued_at'], 'UTC')->format('Y-m-d H:i:s.u') : $now;
            $seq = DB::table('sales_orders')->where('chapter_id', $chapterId)->whereNotNull('si_reference')->lockForUpdate()->count() + 1;
            $siRef = sprintf('%s-SI-2026-%06d', (string) ($actor['chapter_code'] ?? 'CH'), $seq);

            $siId = DB::table('sales_invoices')->insertGetId([
                'chapter_id' => $chapterId, 'si_reference' => $siRef, 'so_id' => $soId, 'so_material_version' => (int) $so->material_version,
                'buyer_name' => (string) $so->buyer_name, 'item_variant_id' => (int) $so->item_variant_id,
                'available_qty' => (string) $so->reserved_available_qty, 'backordered_qty' => (string) $so->accepted_backorder_qty,
                'unit_price' => (string) $so->unit_price, 'discount_amount' => (string) $so->discount_amount, 'net_amount_due' => (string) $so->net_amount_due,
                'issued_by_user_id' => (int) $actor['user_id'], 'issued_at' => $issuedAt,
            ]);
            $newVer = (int) $so->row_version + 1;
            DB::table('sales_orders')->where('id', $soId)->update(['si_reference' => $siRef, 'row_version' => $newVer, 'updated_at' => $now]);
            $this->logEvent($chapterId, $soId, $newVer, (int) $so->material_version, 'issueFullOrderSalesInvoice', (int) $actor['user_id'], $siRef, $now);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'sales.issue_invoice', $key, $hash, 'IssueSi@p12.v1',
                ChapterOutcomes::recordState((string) $siId, 'SI', 1, (int) $so->material_version, ['si_reference' => $siRef]),
                ['invoice' => [
                    'si_id' => (string) $siId, 'si_reference' => $siRef, 'so_id' => (string) $soId, 'so_reference' => (string) $so->reference,
                    'available_quantity' => QuantityMath::microToWireString(QuantityMath::dbToMicroString((string) $so->reserved_available_qty), (int) $so->unit_scale),
                    'backordered_quantity' => QuantityMath::microToWireString(QuantityMath::dbToMicroString((string) $so->accepted_backorder_qty), (int) $so->unit_scale),
                    'net_amount_due' => (string) $so->net_amount_due, 'is_proof_of_payment' => false, 'release_authority_granted' => false,
                ]], 201);
        }, 3);
    }

    /** @return array<string, mixed> */
    public function loadDto(int $chapterId, int $soId): array
    {
        return $this->soDto(DB::table('sales_orders')->where('chapter_id', $chapterId)->where('id', $soId)->first());
    }

    /** @return array<string, mixed> */
    private function soRecordState(object $so): array
    {
        return ChapterOutcomes::recordState((string) $so->id, 'SO', (int) $so->row_version, (int) $so->material_version, [
            'status' => (string) $so->status, 'unpaid_available_state' => (string) $so->unpaid_available_state, 'backorder_state' => (string) $so->backorder_state,
        ]);
    }

    /** @return array<string, mixed> */
    private function soDto(object $so): array
    {
        $s = (int) $so->unit_scale;
        $w = fn (string $dbVal): string => QuantityMath::microToWireString(QuantityMath::dbToMicroString($dbVal), $s);

        return [
            'so_id' => (string) $so->id, 'chapter_id' => (string) $so->chapter_id, 'reference' => $so->reference,
            'sales_officer_id' => (string) $so->sales_officer_user_id, 'buyer_name' => (string) $so->buyer_name,
            'buyer_contact' => (string) $so->buyer_contact, 'buyer_has_login' => false, 'variant_id' => (string) $so->item_variant_id,
            'ordered_quantity' => QuantityMath::toUnitQuantity(QuantityMath::dbToMicroString((string) $so->ordered_qty), $s),
            'unit_price' => (string) $so->unit_price, 'discount_amount' => (string) $so->discount_amount, 'net_amount_due' => (string) $so->net_amount_due,
            'estimated_procurement_cost' => (string) $so->estimated_procurement_cost, 'finance_cost_approved' => (bool) $so->finance_cost_approved,
            'payment_terms' => (string) $so->payment_terms, 'fulfillment_arrangement' => (string) $so->fulfillment_arrangement,
            'status' => (string) $so->status, 'row_version' => (int) $so->row_version, 'material_version' => (int) $so->material_version,
            'split_completed' => (bool) $so->split_completed, 'reserved_available_quantity' => $w((string) $so->reserved_available_qty),
            'paid_available_quantity' => $w((string) $so->paid_available_qty), 'backorder_shortage_quantity' => $w((string) $so->backorder_shortage_qty),
            'accepted_backorder_quantity' => $w((string) $so->accepted_backorder_qty), 'declined_shortage_quantity' => $w((string) $so->declined_shortage_qty),
            'can_procure_shortage' => (bool) $so->can_procure_shortage, 'unpaid_available_state' => (string) $so->unpaid_available_state,
            'backorder_state' => (string) $so->backorder_state, 'available_reservation_expires_at' => $so->available_reservation_expires_at,
            'buyer_acceptance_decision' => $so->buyer_acceptance_decision, 'backorder_deposit_expires_at' => $so->backorder_deposit_expires_at,
            'backorder_deposit_paid' => (string) $so->backorder_deposit_paid, 'partial_unfunded_credit' => (string) $so->partial_unfunded_credit,
            'overdue_pickup_alert' => (bool) $so->overdue_pickup_alert, 'payment_hold_expiry_notice' => (bool) $so->payment_hold_expiry_notice,
            'funded_or_reference' => $so->funded_or_reference, 'repf_reference' => $so->repf_reference, 'si_reference' => $so->si_reference,
        ];
    }

    private function netAmount(string $qtyMicro, string $price, string $discount): string
    {
        $q = (int) $qtyMicro;
        $p = QuantityMath::toCents($price);
        $gross = (intdiv($q, 1000000) * $p) + intdiv(($q % 1000000) * $p + 500000, 1000000);

        return QuantityMath::fromCents(max(0, $gross - QuantityMath::toCents($discount)));
    }

    private function logEvent(int $cid, int $soId, int $v, int $mv, string $act, int $uid, ?string $reason, string $now): void
    {
        DB::table('sales_order_events')->insert(['chapter_id' => $cid, 'so_id' => $soId, 'row_version' => $v, 'material_version' => $mv, 'action' => $act, 'actor_user_id' => $uid, 'reason' => $reason, 'occurred_at' => $now]);
    }
}
