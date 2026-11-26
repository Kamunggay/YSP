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
 * Phase 3 (P14) Independent Dual 48h Clocks, Finance OR cost verification, funded RepF, and late payment resolution.
 */
final class TwoClocksService
{
    public function __construct(
        private InventoryLedgerParticipant $inventory,
        private SalesOrderService $sales,
        private ChapterOutcomes $outcomes,
    ) {}

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function approveExcessCost(int $chapterId, array $actor, int $soId, string $key, array $in): array
    {
        $cost = QuantityMath::fromCents(QuantityMath::toCents((string) ($in['estimated_procurement_cost'] ?? '0.00')));
        $hash = ChapterOutcomes::fingerprint($chapterId, 'sales.approve_excess_cost', 'ApproveCost@p14.v1', ['so_id' => $soId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $soId, $key, $hash, $in, $cost): array {
            if (($r = $this->outcomes->replay($chapterId, 'sales.approve_excess_cost', $key, $hash)) !== null) {
                return $r;
            }
            $so = DB::table('sales_orders')->where('chapter_id', $chapterId)->where('id', $soId)->lockForUpdate()->first();
            if ($so === null) {
                return $this->outcomes->blocked($chapterId, 404, 'SO_NOT_FOUND', 'Sales order not found.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $so->row_version) {
                return $this->outcomes->stale($chapterId, ChapterOutcomes::recordState((string) $soId, 'SO', (int) $so->row_version, (int) $so->material_version, ['status' => (string) $so->status]));
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $newVer = (int) $so->row_version + 1;
            DB::table('sales_orders')->where('id', $soId)->update([
                'estimated_procurement_cost' => QuantityMath::toCents($cost) > 0 ? $cost : (string) $so->estimated_procurement_cost,
                'finance_cost_approved' => true, 'row_version' => $newVer, 'updated_at' => $now,
            ]);
            DB::table('sales_order_events')->insert(['chapter_id' => $chapterId, 'so_id' => $soId, 'row_version' => $newVer, 'material_version' => (int) $so->material_version, 'action' => 'approveFinanceExcessCost', 'actor_user_id' => (int) $actor['user_id'], 'reason' => null, 'occurred_at' => $now]);
            $dto = $this->sales->loadDto($chapterId, $soId);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'sales.approve_excess_cost', $key, $hash, 'ApproveCost@p14.v1',
                ChapterOutcomes::recordState((string) $soId, 'SO', $newVer, (int) $so->material_version, ['status' => (string) $dto['status']]),
                ['order' => $dto]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function recordFunding(int $chapterId, array $actor, int $soId, string $key, array $in): array
    {
        [$scope, $orRef] = [(string) ($in['funding_scope'] ?? ''), trim((string) ($in['or_reference'] ?? ''))];
        $cents = QuantityMath::toCents((string) ($in['amount'] ?? '0.00'));
        if (! in_array($scope, ['backorder_deposit', 'available_reservation'], true) || $orRef === '' || $cents <= 0) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'funding_scope, or_reference, and positive amount are required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'sales.record_funding', 'RecordFund@p14.v1', ['so_id' => $soId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $soId, $key, $hash, $in, $scope, $orRef, $cents): array {
            if (($r = $this->outcomes->replay($chapterId, 'sales.record_funding', $key, $hash)) !== null) {
                return $r;
            }
            $so = DB::table('sales_orders')->where('chapter_id', $chapterId)->where('id', $soId)->lockForUpdate()->first();
            if ($so === null) {
                return $this->outcomes->blocked($chapterId, 404, 'SO_NOT_FOUND', 'Sales order not found.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $so->row_version) {
                return $this->outcomes->stale($chapterId, ChapterOutcomes::recordState((string) $soId, 'SO', (int) $so->row_version, (int) $so->material_version, ['status' => (string) $so->status]));
            }
            $now = now()->format('Y-m-d H:i:s.u');
            $vAt = isset($in['verified_at']) ? CarbonImmutable::parse((string) $in['verified_at'], 'UTC') : CarbonImmutable::parse($now, 'UTC');
            $newVer = (int) $so->row_version + 1;
            $upd = ['row_version' => $newVer, 'funded_or_reference' => $orRef, 'updated_at' => $now];

            if ($scope === 'backorder_deposit') {
                if ((string) $so->backorder_state !== 'awaiting_deposit' || ($so->backorder_deposit_expires_at && $vAt->gt(CarbonImmutable::parse((string) $so->backorder_deposit_expires_at, 'UTC')))) {
                    return $this->outcomes->blocked($chapterId, 409, 'BACKORDER_DEPOSIT_WINDOW_CLOSED', 'Backorder deposit window is not awaiting deposit or has expired.');
                }
                $newDeposit = QuantityMath::toCents((string) $so->backorder_deposit_paid) + $cents;
                $costCents = QuantityMath::toCents((string) $so->estimated_procurement_cost);
                if ($newDeposit < $costCents) {
                    $upd += ['backorder_deposit_paid' => QuantityMath::fromCents($newDeposit), 'partial_unfunded_credit' => QuantityMath::fromCents($newDeposit), 'can_procure_shortage' => false];
                } else {
                    $upd += ['backorder_deposit_paid' => QuantityMath::fromCents($newDeposit), 'partial_unfunded_credit' => '0.00', 'backorder_state' => 'funded_protected', 'can_procure_shortage' => true];
                }
            } else {
                if ((string) $so->unpaid_available_state !== 'active_unpaid' || ($so->available_reservation_expires_at && $vAt->gt(CarbonImmutable::parse((string) $so->available_reservation_expires_at, 'UTC')))) {
                    return $this->outcomes->blocked($chapterId, 409, 'AVAILABLE_RESERVATION_WINDOW_CLOSED', 'Available stock 48h payment window has closed; use late-payment resolution.');
                }
                $availMicro = QuantityMath::dbToMicroString((string) $so->reserved_available_qty);
                $pool = DB::table('sale_stock_pools')->where('chapter_id', $chapterId)->where('item_variant_id', (int) $so->item_variant_id)->lockForUpdate()->first();
                if ($pool !== null) {
                    $uPool = QuantityMath::dbToMicroString((string) $pool->so_unpaid_reserved_qty);
                    $pPool = QuantityMath::dbToMicroString((string) $pool->so_paid_reserved_qty);
                    DB::table('sale_stock_pools')->where('id', (int) $pool->id)->update([
                        'so_unpaid_reserved_qty' => QuantityMath::microToDbString(QuantityMath::cmp($uPool, $availMicro) > 0 ? QuantityMath::sub($uPool, $availMicro) : '0'),
                        'so_paid_reserved_qty' => QuantityMath::microToDbString(QuantityMath::add($pPool, $availMicro)),
                        'row_version' => (int) $pool->row_version + 1, 'updated_at' => $now,
                    ]);
                }
                $upd += ['unpaid_available_state' => 'paid_protected', 'paid_available_qty' => (string) $so->reserved_available_qty];
            }

            DB::table('sales_orders')->where('id', $soId)->update($upd);
            DB::table('so_funding_events')->insert([
                'chapter_id' => $chapterId, 'so_id' => $soId, 'funding_scope' => $scope, 'or_reference' => $orRef,
                'amount' => QuantityMath::fromCents($cents), 'actor_user_id' => (int) $actor['user_id'], 'verified_at' => $vAt->format('Y-m-d H:i:s.u'),
            ]);
            DB::table('sales_order_events')->insert(['chapter_id' => $chapterId, 'so_id' => $soId, 'row_version' => $newVer, 'material_version' => (int) $so->material_version, 'action' => "verifyOrPayment:{$scope}", 'actor_user_id' => (int) $actor['user_id'], 'reason' => $orRef, 'occurred_at' => $now]);

            $dto = $this->sales->loadDto($chapterId, $soId);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'sales.record_funding', $key, $hash, 'RecordFund@p14.v1',
                ChapterOutcomes::recordState((string) $soId, 'SO', $newVer, (int) $so->material_version, ['unpaid_available_state' => (string) $dto['unpaid_available_state'], 'backorder_state' => (string) $dto['backorder_state']]),
                ['order' => $dto]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function evaluateClocks(int $chapterId, array $actor, int $soId, string $key, array $in): array
    {
        $asOfStr = (string) ($in['as_of'] ?? now()->format('Y-m-d\TH:i:s\Z'));
        $asOf = CarbonImmutable::parse($asOfStr, 'UTC');
        $hash = ChapterOutcomes::fingerprint($chapterId, 'sales.evaluate_clocks', 'EvalClocks@p14.v1', ['so_id' => $soId, 'as_of' => $asOf->format('Y-m-d H:i:s.u'), 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $soId, $key, $hash, $in, $asOf): array {
            if (($r = $this->outcomes->replay($chapterId, 'sales.evaluate_clocks', $key, $hash)) !== null) {
                return $r;
            }
            $so = DB::table('sales_orders')->where('chapter_id', $chapterId)->where('id', $soId)->lockForUpdate()->first();
            if ($so === null) {
                return $this->outcomes->blocked($chapterId, 404, 'SO_NOT_FOUND', 'Sales order not found.');
            }
            if (isset($in['expected_row_version']) && (int) $in['expected_row_version'] !== (int) $so->row_version) {
                return $this->outcomes->stale($chapterId, ChapterOutcomes::recordState((string) $soId, 'SO', (int) $so->row_version, (int) $so->material_version, ['status' => (string) $so->status]));
            }

            $now = now()->format('Y-m-d H:i:s.u');
            [$changed, $upd] = [false, ['updated_at' => $now]];

            if ((string) $so->unpaid_available_state === 'active_unpaid' && $so->available_reservation_expires_at
                && $asOf->gte(CarbonImmutable::parse((string) $so->available_reservation_expires_at, 'UTC'))) {
                $rel = QuantityMath::dbToMicroString((string) $so->reserved_available_qty);
                $pool = DB::table('sale_stock_pools')->where('chapter_id', $chapterId)->where('item_variant_id', (int) $so->item_variant_id)->lockForUpdate()->first();
                if ($pool !== null && QuantityMath::cmp($rel, '0') > 0) {
                    $uPool = QuantityMath::dbToMicroString((string) $pool->so_unpaid_reserved_qty);
                    DB::table('sale_stock_pools')->where('id', (int) $pool->id)->update([
                        'so_unpaid_reserved_qty' => QuantityMath::microToDbString(QuantityMath::cmp($uPool, $rel) > 0 ? QuantityMath::sub($uPool, $rel) : '0'),
                        'row_version' => (int) $pool->row_version + 1, 'updated_at' => $now,
                    ]);
                }
                $upd += ['unpaid_available_state' => 'expired_released', 'payment_hold_expiry_notice' => true];
                $changed = true;
            }

            if ((string) $so->backorder_state === 'awaiting_deposit' && $so->backorder_deposit_expires_at
                && $asOf->gte(CarbonImmutable::parse((string) $so->backorder_deposit_expires_at, 'UTC'))) {
                $upd += ['backorder_state' => 'lapsed_unfunded', 'can_procure_shortage' => false,
                    'partial_unfunded_credit' => (string) $so->backorder_deposit_paid];
                $changed = true;
            }

            if ($so->pickup_deadline_at && $asOf->gte(CarbonImmutable::parse((string) $so->pickup_deadline_at, 'UTC'))
                && (string) $so->unpaid_available_state === 'paid_protected' && ! (bool) $so->overdue_pickup_alert) {
                $upd += ['overdue_pickup_alert' => true];
                $changed = true;
            }

            $newVer = (int) $so->row_version;
            if ($changed) {
                $newVer++;
                $upd['row_version'] = $newVer;
                DB::table('sales_orders')->where('id', $soId)->update($upd);
                DB::table('sales_order_events')->insert(['chapter_id' => $chapterId, 'so_id' => $soId, 'row_version' => $newVer, 'material_version' => (int) $so->material_version, 'action' => 'evaluateClocks', 'actor_user_id' => (int) $actor['user_id'], 'reason' => $asOf->toIso8601String(), 'occurred_at' => $now]);
            }

            $dto = $this->sales->loadDto($chapterId, $soId);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'sales.evaluate_clocks', $key, $hash, 'EvalClocks@p14.v1',
                ChapterOutcomes::recordState((string) $soId, 'SO', $newVer, (int) $so->material_version, ['unpaid_available_state' => (string) $dto['unpaid_available_state'], 'backorder_state' => (string) $dto['backorder_state']]),
                ['order' => $dto]);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function forwardRepf(int $chapterId, array $actor, int $soId, string $key, array $in): array
    {
        $hash = ChapterOutcomes::fingerprint($chapterId, 'sales.forward_repf', 'ForwardRepf@p14.v1', ['so_id' => $soId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $soId, $key, $hash, $in): array {
            if (($r = $this->outcomes->replay($chapterId, 'sales.forward_repf', $key, $hash)) !== null) {
                return $r;
            }
            $so = DB::table('sales_orders')->where('chapter_id', $chapterId)->where('id', $soId)->lockForUpdate()->first();
            if ($so === null) {
                return $this->outcomes->blocked($chapterId, 404, 'SO_NOT_FOUND', 'Sales order not found.');
            }
            if ((string) $so->backorder_state !== 'funded_protected' || ! (bool) $so->can_procure_shortage) {
                return $this->outcomes->blocked($chapterId, 409, 'SHORTAGE_NOT_FUNDED', 'Unfunded backorders cannot be forwarded to Purchasing (RepF).');
            }
            if (! (bool) $so->finance_cost_approved) {
                return $this->outcomes->blocked($chapterId, 409, 'FINANCE_COST_APPROVAL_REQUIRED', 'Finance cost approval is required before forwarding funded backorders to Purchasing.');
            }
            if ($so->repf_reference !== null) {
                return $this->outcomes->blocked($chapterId, 409, 'REPF_ALREADY_FORWARDED', 'Funded RepF was already forwarded for this order.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $so->row_version) {
                return $this->outcomes->stale($chapterId, ChapterOutcomes::recordState((string) $soId, 'SO', (int) $so->row_version, (int) $so->material_version, ['backorder_state' => (string) $so->backorder_state]));
            }

            $now = now()->format('Y-m-d H:i:s.u');
            $seq = DB::table('sales_orders')->where('chapter_id', $chapterId)->whereNotNull('repf_reference')->lockForUpdate()->count() + 1;
            $repfRef = sprintf('%s-REPF-2026-%06d', (string) ($actor['chapter_code'] ?? 'CH'), $seq);
            $repfId = DB::table('so_repf_forwards')->insertGetId([
                'chapter_id' => $chapterId, 'so_id' => $soId, 'repf_reference' => $repfRef,
                'funded_or_reference' => (string) $so->funded_or_reference, 'quantity' => (string) $so->accepted_backorder_qty,
                'approved_cost' => (string) $so->estimated_procurement_cost, 'forwarded_by_user_id' => (int) $actor['user_id'], 'forwarded_at' => $now,
            ]);
            $newVer = (int) $so->row_version + 1;
            DB::table('sales_orders')->where('id', $soId)->update(['repf_reference' => $repfRef, 'row_version' => $newVer, 'updated_at' => $now]);
            DB::table('sales_order_events')->insert(['chapter_id' => $chapterId, 'so_id' => $soId, 'row_version' => $newVer, 'material_version' => (int) $so->material_version, 'action' => 'forwardFundedRepf', 'actor_user_id' => (int) $actor['user_id'], 'reason' => $repfRef, 'occurred_at' => $now]);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'sales.forward_repf', $key, $hash, 'ForwardRepf@p14.v1',
                ChapterOutcomes::recordState((string) $repfId, 'REPF', 1, (int) $so->material_version, ['repf_reference' => $repfRef]),
                ['repf' => ['repf_id' => (string) $repfId, 'repf_reference' => $repfRef, 'so_id' => (string) $soId, 'funded_or_reference' => (string) $so->funded_or_reference,
                    'quantity' => QuantityMath::microToWireString(QuantityMath::dbToMicroString((string) $so->accepted_backorder_qty), (int) $so->unit_scale)]],
                201);
        }, 3);
    }

    /** @param array<string, mixed> $actor
     * @param  array<string, mixed>  $in
     * @return array{http_status: int, body: array<string, mixed>} */
    public function resolveLatePayment(int $chapterId, array $actor, int $soId, string $key, array $in): array
    {
        [$orRef, $reqStr, $fallback] = [trim((string) ($in['or_reference'] ?? '')), trim((string) ($in['requested_quantity_value'] ?? '')), (string) ($in['fallback_choice'] ?? 'route_to_finance_refund')];
        if ($orRef === '' || ! in_array($fallback, ['convert_to_funded_backorder', 'route_to_finance_refund'], true)) {
            return $this->outcomes->blocked($chapterId, 422, 'INVALID_INPUT', 'or_reference, requested_quantity_value, and valid fallback_choice are required.');
        }
        $hash = ChapterOutcomes::fingerprint($chapterId, 'sales.resolve_late_payment', 'LatePay@p14.v1', ['so_id' => $soId, 'in' => $in]);

        return DB::transaction(function () use ($chapterId, $actor, $soId, $key, $hash, $in, $orRef, $reqStr, $fallback): array {
            if (($r = $this->outcomes->replay($chapterId, 'sales.resolve_late_payment', $key, $hash)) !== null) {
                return $r;
            }
            $peek = DB::table('sales_orders')->where('chapter_id', $chapterId)->where('id', $soId)->first();
            if ($peek === null) {
                return $this->outcomes->blocked($chapterId, 404, 'SO_NOT_FOUND', 'Sales order not found.');
            }
            $wh = $this->inventory->lockVariantAndReadWarehouse($chapterId, (int) $peek->item_variant_id);
            $pool = DB::table('sale_stock_pools')->where('chapter_id', $chapterId)->where('item_variant_id', (int) $peek->item_variant_id)->lockForUpdate()->first();
            $so = DB::table('sales_orders')->where('id', $soId)->lockForUpdate()->first();

            if ($wh === null || (string) $so->unpaid_available_state !== 'expired_released') {
                return $this->outcomes->blocked($chapterId, 409, 'NOT_EXPIRED_RELEASED', 'Late-payment resolution applies only after unpaid reservation expiry.');
            }
            if (! is_int($in['expected_row_version'] ?? null) || (int) $in['expected_row_version'] !== (int) $so->row_version) {
                return $this->outcomes->stale($chapterId, ChapterOutcomes::recordState((string) $soId, 'SO', (int) $so->row_version, (int) $so->material_version, ['unpaid_available_state' => (string) $so->unpaid_available_state]));
            }
            $s = (int) $so->unit_scale;
            try {
                $reqMicro = QuantityMath::toMicroString($reqStr, $s);
            } catch (InvalidArgumentException $e) {
                return $this->outcomes->blocked($chapterId, 422, 'INVALID_UNIT_PRECISION', $e->getMessage());
            }

            $soUnpaid = $pool ? QuantityMath::dbToMicroString((string) $pool->so_unpaid_reserved_qty) : '0';
            $soPaid = $pool ? QuantityMath::dbToMicroString((string) $pool->so_paid_reserved_qty) : '0';
            $used = QuantityMath::add($wh['rf'], QuantityMath::add($soUnpaid, $soPaid));
            $avail = QuantityMath::cmp($wh['on_hand'], $used) > 0 ? QuantityMath::sub($wh['on_hand'], $used) : '0';

            $now = now()->format('Y-m-d H:i:s.u');
            $resAt = isset($in['verified_at']) ? CarbonImmutable::parse((string) $in['verified_at'], 'UTC')->format('Y-m-d H:i:s.u') : $now;
            $newVer = (int) $so->row_version + 1;
            $upd = ['row_version' => $newVer, 'funded_or_reference' => $orRef, 'updated_at' => $now];

            if (QuantityMath::cmp($avail, $reqMicro) >= 0) {
                $outcome = 'allocated_fresh_paid';
                if ($pool !== null) {
                    DB::table('sale_stock_pools')->where('id', (int) $pool->id)->update([
                        'so_paid_reserved_qty' => QuantityMath::microToDbString(QuantityMath::add($soPaid, $reqMicro)),
                        'row_version' => (int) $pool->row_version + 1, 'updated_at' => $now,
                    ]);
                }
                $upd += ['paid_available_qty' => QuantityMath::microToDbString($reqMicro), 'unpaid_available_state' => 'paid_protected'];
            } else {
                $outcome = $fallback;
                if ($fallback === 'convert_to_funded_backorder') {
                    $upd += ['accepted_backorder_qty' => QuantityMath::microToDbString(QuantityMath::add(QuantityMath::dbToMicroString((string) $so->accepted_backorder_qty), $reqMicro)),
                        'backorder_state' => 'funded_protected', 'can_procure_shortage' => true];
                }
            }

            DB::table('sales_orders')->where('id', $soId)->update($upd);
            $resId = DB::table('so_late_payment_resolutions')->insertGetId([
                'chapter_id' => $chapterId, 'so_id' => $soId, 'or_reference' => $orRef, 'requested_qty' => QuantityMath::microToDbString($reqMicro),
                'available_at_check' => QuantityMath::microToDbString($avail), 'outcome' => $outcome, 'actor_user_id' => (int) $actor['user_id'], 'resolved_at' => $resAt,
            ]);
            DB::table('sales_order_events')->insert(['chapter_id' => $chapterId, 'so_id' => $soId, 'row_version' => $newVer, 'material_version' => (int) $so->material_version, 'action' => "resolveLateVerifiedPayment:{$outcome}", 'actor_user_id' => (int) $actor['user_id'], 'reason' => $orRef, 'occurred_at' => $now]);

            return $this->outcomes->commitSuccess($chapterId, $actor, 'sales.resolve_late_payment', $key, $hash, 'LatePay@p14.v1',
                ChapterOutcomes::recordState((string) $resId, 'LATE_PAYMENT', 1, (int) $so->material_version, ['outcome' => $outcome]),
                ['resolution' => ['resolution_id' => (string) $resId, 'order_id' => (string) $soId, 'outcome' => $outcome, 'available_at_check' => QuantityMath::microToWireString($avail, $s)]]);
        }, 3);
    }
}
