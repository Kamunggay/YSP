<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\InternalRf;
use App\Models\InventoryLot;
use App\Models\LotRestrictionAssignment;
use App\Services\Shared\BcMath;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Evaluates ADR 0004 lot/segment eligibility, active holds, active reservations,
 * and basis-coordinate consumed intervals for Stage 1 and Stage 2A queries/guards.
 */
final class StockEligibilityEvaluator
{
    private const SOURCE_KIND_MAP = [
        'IPC' => 'opening_rm',
        'OPENING_RM' => 'opening_rm',
        'PO_DR' => 'po_rm',
        'PO_RM' => 'po_rm',
        'PO' => 'po_rm',
        'DA' => 'da_rm',
        'DA_RM' => 'da_rm',
    ];

    public function __construct(
        private readonly StockViewQueryService $stockViewQuery,
    ) {}

    /**
     * Evaluate one InventoryLot either generally (for internal RF allocation readiness when $targetRf === null)
     * or specifically against $targetRf at $observedAt.
     *
     * @param  array{
     *   lot_restriction_ids?: array<string, bool>,
     *   consumed_by_lot?: array<string, array{basis_total: string, consumed_intervals: array}>,
     *   holds_by_lot?: array<string, array>,
     *   reservations_by_lot?: array<string, array>
     * }  $preloaded
     * @return array<string, mixed>
     */
    public function evaluateLot(
        InventoryLot $lot,
        ?InternalRf $targetRf = null,
        ?CarbonImmutable $observedAt = null,
        array $preloaded = [],
        string $intendedUse = 'internal_use',
    ): array {
        $now = ($observedAt ?? CarbonImmutable::now('UTC'))->utc();
        $scale = (int) ($lot->quantity_scale ?? 0);

        if (strtoupper((string) $lot->condition) !== 'USABLE' || strtoupper((string) $lot->custody) !== 'STOCKROOM') {
            return $this->unusableResult($lot, $scale);
        }

        $consumedData = $preloaded['consumed_by_lot'][$lot->id]
            ?? $this->stockViewQuery->getConsumedIntervalsForLot($lot);
        $consumedIntervals = $consumedData['consumed_intervals'];
        $holdIntervals = $preloaded['holds_by_lot'][$lot->id]
            ?? $this->stockViewQuery->getActiveHoldRangesForLot($lot->chapter_id, $lot->id);
        $reservationIntervals = $preloaded['reservations_by_lot'][$lot->id]
            ?? $this->stockViewQuery->getActiveReservationRangesForLot($lot->chapter_id, $lot->id);

        $hasLegacyLotRestriction = isset($preloaded['lot_restriction_ids'])
            ? (bool) ($preloaded['lot_restriction_ids'][$lot->id] ?? false)
            : LotRestrictionAssignment::where('lot_id', $lot->id)->exists();

        $immediatelyAllocatable = $lot->getAttribute('immediately_allocatable');
        $forceUninterpreted = $immediatelyAllocatable === false || $immediatelyAllocatable === 0 || $immediatelyAllocatable === '0';

        $segments = is_array($lot->segments) && $lot->segments !== []
            ? $lot->segments
            : [[
                'id' => (string) ($lot->basis_segment_id ?: $lot->id),
                'basis_segment_id' => (string) ($lot->basis_segment_id ?: $lot->id),
                'offset_quantity' => '0',
                'quantity' => $consumedData['basis_total'],
                'restrictions' => null,
            ]];

        $usableOnHand = BcMath::str('0');
        $activeHoldQty = BcMath::str('0');
        $eligibleOnHand = BcMath::str('0');
        $eligibleUnheld = BcMath::str('0');
        $eligibleFree = BcMath::str('0');
        $eligibleBoundedFree = BcMath::str('0');
        $eligibleUnrestrictedFree = BcMath::str('0');
        $ineligibleRestrictedQty = BcMath::str('0');
        $uninterpretedRestrictedQty = BcMath::str('0');

        $freeIntervalsOut = [];
        $hasEligibleUnrestricted = false;
        $hasEligibleBounded = false;

        foreach ($segments as $segment) {
            if (! is_array($segment)) {
                continue;
            }
            $segOffset = BcMath::str($segment['offset_quantity'] ?? '0');
            $segQty = BcMath::str($segment['quantity'] ?? '0');
            if (! BcMath::isPositive($segQty)) {
                continue;
            }

            $base = [['offset' => $segOffset, 'quantity' => $segQty]];
            $onHandIntervals = $this->subtractIntervals($base, $consumedIntervals);
            $segOnHand = $this->sumIntervals($onHandIntervals);
            if (! BcMath::isPositive($segOnHand)) {
                continue;
            }

            $unheldIntervals = $this->subtractIntervals($onHandIntervals, $holdIntervals);
            $segUnheld = $this->sumIntervals($unheldIntervals);
            $segHeld = BcMath::sub($segOnHand, $segUnheld);

            $freeIntervals = $this->subtractIntervals($unheldIntervals, $reservationIntervals);
            $segFree = $this->sumIntervals($freeIntervals);

            $usableOnHand = BcMath::add($usableOnHand, $segOnHand);
            $activeHoldQty = BcMath::add($activeHoldQty, $segHeld);

            $eval = $this->classifyRestriction(
                $segment['restrictions'] ?? null,
                $targetRf,
                $now,
                $forceUninterpreted,
                $hasLegacyLotRestriction,
                $intendedUse
            );

            if ($eval['status'] === 'uninterpreted') {
                $uninterpretedRestrictedQty = BcMath::add($uninterpretedRestrictedQty, $segOnHand);
                $ineligibleRestrictedQty = BcMath::add($ineligibleRestrictedQty, $segOnHand);

                continue;
            }

            if ($eval['status'] === 'ineligible_bounded') {
                $ineligibleRestrictedQty = BcMath::add($ineligibleRestrictedQty, $segOnHand);

                continue;
            }

            $eligibleOnHand = BcMath::add($eligibleOnHand, $segOnHand);
            $eligibleUnheld = BcMath::add($eligibleUnheld, $segUnheld);
            $eligibleFree = BcMath::add($eligibleFree, $segFree);

            if ($eval['status'] === 'eligible_bounded') {
                $hasEligibleBounded = true;
                $eligibleBoundedFree = BcMath::add($eligibleBoundedFree, $segFree);
            } else {
                $hasEligibleUnrestricted = true;
                $eligibleUnrestrictedFree = BcMath::add($eligibleUnrestrictedFree, $segFree);
            }

            $segId = (string) ($segment['basis_segment_id'] ?? $segment['id'] ?? $lot->basis_segment_id ?? $lot->id);
            foreach ($freeIntervals as $interval) {
                $freeIntervalsOut[] = [
                    'basis_segment_id' => $segId,
                    'offset_quantity' => BcMath::format($interval['offset'], $scale),
                    'quantity' => BcMath::format($interval['quantity'], $scale),
                    'restriction_state' => $eval['status'] === 'eligible_bounded' ? 'bounded' : 'unrestricted',
                ];
            }
        }

        $restrictionState = $hasEligibleBounded && ! $hasEligibleUnrestricted
            ? 'bounded'
            : ($hasEligibleUnrestricted && $hasEligibleBounded ? 'bounded' : 'unrestricted');

        if (! BcMath::isPositive($eligibleFree) && BcMath::isPositive($uninterpretedRestrictedQty)) {
            $restrictionState = 'uninterpreted';
        } elseif (! BcMath::isPositive($eligibleFree) && BcMath::isPositive($ineligibleRestrictedQty)) {
            $restrictionState = 'bounded';
        }

        return [
            'stock_lot_id' => $lot->id,
            'source_kind' => self::mapSourceKind($lot->source_type),
            'source_reference' => $lot->source_reference ?: $lot->lot_code,
            'location_id' => $lot->location_id,
            'quantity_scale' => $scale,
            'is_usable_stockroom' => true,
            'usable_stockroom_on_hand' => $usableOnHand,
            'active_stock_hold_quantity' => $activeHoldQty,
            'eligible_usable_stockroom_on_hand' => $eligibleOnHand,
            'eligible_unheld_quantity' => $eligibleUnheld,
            'eligible_free_quantity' => $eligibleFree,
            'eligible_bounded_free_quantity' => $eligibleBoundedFree,
            'eligible_unrestricted_free_quantity' => $eligibleUnrestrictedFree,
            'ineligible_restricted_quantity' => $ineligibleRestrictedQty,
            'uninterpreted_restricted_quantity' => $uninterpretedRestrictedQty,
            'restriction_state' => $restrictionState,
            'free_intervals' => $freeIntervalsOut,
        ];
    }

    /**
     * Evaluate whether a specific target interval [offset, offset + quantity) on $lot
     * is eligible for $targetRf at $observedAt (no uninterpreted or mismatched bounded segments).
     *
     * @return array{eligible: bool, reason: string|null, code: 'stock_ineligible'|'restricted_mismatch'|null}
     */
    public function verifyIntervalForRf(
        InventoryLot $lot,
        string $offset,
        string $quantity,
        InternalRf $targetRf,
        ?CarbonImmutable $observedAt = null
    ): array {
        $now = ($observedAt ?? CarbonImmutable::now('UTC'))->utc();
        if (strtoupper((string) $lot->condition) !== 'USABLE' || strtoupper((string) $lot->custody) !== 'STOCKROOM') {
            return [
                'eligible' => false,
                'code' => 'stock_ineligible',
                'reason' => "Stock lot {$lot->id} is not usable stockroom stock.",
            ];
        }

        $immediatelyAllocatable = $lot->getAttribute('immediately_allocatable');
        if ($immediatelyAllocatable === false || $immediatelyAllocatable === 0 || $immediatelyAllocatable === '0') {
            return [
                'eligible' => false,
                'code' => 'stock_ineligible',
                'reason' => "Stock lot {$lot->id} has unresolved ADR 0004 donor restrictions.",
            ];
        }

        $hasLegacyLotRestriction = LotRestrictionAssignment::where('lot_id', $lot->id)->exists();

        $segments = is_array($lot->segments) && $lot->segments !== []
            ? $lot->segments
            : [[
                'offset_quantity' => '0',
                'quantity' => BcMath::str($lot->original_quantity ?? $lot->quantity_on_hand),
                'restrictions' => null,
            ]];

        $targetStart = BcMath::str($offset);
        $targetEnd = BcMath::add($targetStart, $quantity);
        $coveredQty = BcMath::str('0');

        foreach ($segments as $segment) {
            if (! is_array($segment)) {
                continue;
            }
            $segStart = BcMath::str($segment['offset_quantity'] ?? '0');
            $segQty = BcMath::str($segment['quantity'] ?? '0');
            if (! BcMath::isPositive($segQty)) {
                continue;
            }
            $segEnd = BcMath::add($segStart, $segQty);

            $overlapStart = BcMath::max($targetStart, $segStart);
            $overlapEnd = BcMath::min($targetEnd, $segEnd);
            if (BcMath::comp($overlapStart, $overlapEnd) >= 0) {
                continue;
            }

            $overlapLen = BcMath::sub($overlapEnd, $overlapStart);
            $coveredQty = BcMath::add($coveredQty, $overlapLen);

            $eval = $this->classifyRestriction(
                $segment['restrictions'] ?? null,
                $targetRf,
                $now,
                false,
                $hasLegacyLotRestriction
            );

            if ($eval['status'] === 'uninterpreted') {
                return [
                    'eligible' => false,
                    'code' => 'stock_ineligible',
                    'reason' => "Stock lot {$lot->id} carries uninterpreted ADR 0004 donor restrictions.",
                ];
            }
            if ($eval['status'] === 'ineligible_bounded') {
                return [
                    'eligible' => false,
                    'code' => 'stock_ineligible',
                    'reason' => $eval['reason'] ?? "Stock lot {$lot->id} restriction does not permit internal RF {$targetRf->rf_number}.",
                ];
            }
        }

        if (BcMath::comp($coveredQty, BcMath::str($quantity)) < 0 && $hasLegacyLotRestriction) {
            return [
                'eligible' => false,
                'code' => 'stock_ineligible',
                'reason' => "Stock lot {$lot->id} carries a lot restriction.",
            ];
        }

        return ['eligible' => true, 'code' => null, 'reason' => null];
    }

    /**
     * Preload consumed/hold/reservation/legacy-restriction maps for a collection of InventoryLots.
     *
     * @param  Collection<int, InventoryLot>  $lots
     * @return array<string, mixed>
     */
    public function preloadLots(string $chapterId, Collection $lots): array
    {
        if ($lots->isEmpty()) {
            return [
                'lot_restriction_ids' => [],
                'consumed_by_lot' => [],
                'holds_by_lot' => [],
                'reservations_by_lot' => [],
            ];
        }

        $lotIds = $lots->pluck('id')->all();
        $restrictedIds = LotRestrictionAssignment::whereIn('lot_id', $lotIds)
            ->pluck('lot_id')
            ->flip()
            ->map(fn () => true)
            ->all();

        $consumedByLot = [];
        $holdsByLot = [];
        $reservationsByLot = [];

        foreach ($lots as $lot) {
            $consumedByLot[$lot->id] = $this->stockViewQuery->getConsumedIntervalsForLot($lot);
            $holdsByLot[$lot->id] = $this->stockViewQuery->getActiveHoldRangesForLot($chapterId, $lot->id);
            $reservationsByLot[$lot->id] = $this->stockViewQuery->getActiveReservationRangesForLot($chapterId, $lot->id);
        }

        return [
            'lot_restriction_ids' => $restrictedIds,
            'consumed_by_lot' => $consumedByLot,
            'holds_by_lot' => $holdsByLot,
            'reservations_by_lot' => $reservationsByLot,
        ];
    }

    public static function mapSourceKind(?string $sourceType): string
    {
        $key = strtoupper(trim((string) $sourceType));

        return self::SOURCE_KIND_MAP[$key] ?? 'opening_rm';
    }

    /**
     * @return array{status: 'eligible_unrestricted'|'eligible_bounded'|'ineligible_bounded'|'uninterpreted', reason: string|null}
     */
    private function classifyRestriction(
        mixed $restrictions,
        ?InternalRf $targetRf,
        CarbonImmutable $now,
        bool $forceUninterpreted,
        bool $hasLegacyLotRestriction,
        string $intendedUse = 'internal_use',
    ): array {
        if ($forceUninterpreted) {
            return ['status' => 'uninterpreted', 'reason' => 'Donor restriction requires interpretation before allocation.'];
        }

        if (! is_array($restrictions)) {
            if ($hasLegacyLotRestriction) {
                return ['status' => 'ineligible_bounded', 'reason' => 'Lot carries an assigned restriction.'];
            }

            return ['status' => 'eligible_unrestricted', 'reason' => null];
        }

        $state = $restrictions['state'] ?? 'unrestricted';
        if ($state === 'unrestricted') {
            if ($hasLegacyLotRestriction) {
                return ['status' => 'ineligible_bounded', 'reason' => 'Lot carries an assigned restriction.'];
            }

            return ['status' => 'eligible_unrestricted', 'reason' => null];
        }

        if ($state === 'uninterpreted') {
            return ['status' => 'uninterpreted', 'reason' => 'Donor restriction has not yet been interpreted.'];
        }

        if ($state !== 'bounded') {
            return ['status' => 'uninterpreted', 'reason' => 'Unknown lot restriction state.'];
        }

        $uses = $restrictions['allowed_uses'] ?? [];
        $rfUse = $targetRf ? strtolower((string) ($targetRf->purpose ?: 'internal_use')) : strtolower($intendedUse);
        if (! is_array($uses) || ! in_array($rfUse, $uses, true)) {
            return ['status' => 'ineligible_bounded', 'reason' => "Bounded lot does not allow use '{$rfUse}'."];
        }

        if (($restrictions['effective_from'] ?? null) !== null
            && $now->lt(CarbonImmutable::parse((string) $restrictions['effective_from'])->utc())) {
            return ['status' => 'ineligible_bounded', 'reason' => 'Bounded restriction effective window has not started yet.'];
        }

        if (($restrictions['effective_until'] ?? null) !== null
            && $now->gt(CarbonImmutable::parse((string) $restrictions['effective_until'])->utc())) {
            return ['status' => 'ineligible_bounded', 'reason' => 'Bounded restriction effective window has expired.'];
        }

        if ($targetRf !== null) {
            $unitIds = $restrictions['requesting_unit_ids'] ?? [];
            if (is_array($unitIds) && $unitIds !== [] && ! in_array($targetRf->requesting_unit_id, $unitIds, true)) {
                return ['status' => 'ineligible_bounded', 'reason' => 'Bounded restriction excludes the requesting unit.'];
            }

            $eventIds = $restrictions['event_ids'] ?? [];
            if (is_array($eventIds) && $eventIds !== [] && ($targetRf->event_id === null || ! in_array($targetRf->event_id, $eventIds, true))) {
                return ['status' => 'ineligible_bounded', 'reason' => 'Bounded restriction excludes the requesting event.'];
            }
        }

        return ['status' => 'eligible_bounded', 'reason' => null];
    }

    /**
     * Subtract a list of half-open intervals $sub from $base intervals.
     *
     * @param  array<int, array{offset: string, quantity: string}>  $base
     * @param  array<int, array{offset: string, quantity: string}>  $sub
     * @return array<int, array{offset: string, quantity: string}>
     */
    private function subtractIntervals(array $base, array $sub): array
    {
        $pieces = [];
        foreach ($base as $b) {
            $start = BcMath::str($b['offset'] ?? '0');
            $qty = BcMath::str($b['quantity'] ?? '0');
            if (BcMath::comp($qty, '0') > 0) {
                $pieces[] = ['start' => $start, 'end' => BcMath::add($start, $qty)];
            }
        }

        foreach ($sub as $s) {
            $sStart = BcMath::str($s['offset'] ?? $s['offset_quantity'] ?? '0');
            $sQty = BcMath::str($s['quantity'] ?? '0');
            if (BcMath::comp($sQty, '0') <= 0) {
                continue;
            }
            $sEnd = BcMath::add($sStart, $sQty);

            $next = [];
            foreach ($pieces as $p) {
                if (BcMath::comp($sEnd, $p['start']) <= 0 || BcMath::comp($sStart, $p['end']) >= 0) {
                    $next[] = $p;

                    continue;
                }
                if (BcMath::comp($sStart, $p['start']) > 0) {
                    $next[] = ['start' => $p['start'], 'end' => $sStart];
                }
                if (BcMath::comp($sEnd, $p['end']) < 0) {
                    $next[] = ['start' => $sEnd, 'end' => $p['end']];
                }
            }
            $pieces = $next;
            if ($pieces === []) {
                break;
            }
        }

        $out = [];
        foreach ($pieces as $p) {
            $qty = BcMath::sub($p['end'], $p['start']);
            if (BcMath::isPositive($qty)) {
                $out[] = ['offset' => $p['start'], 'quantity' => $qty];
            }
        }

        return $out;
    }

    /** @param array<int, array{offset: string, quantity: string}> $intervals */
    private function sumIntervals(array $intervals): string
    {
        $sum = BcMath::str('0');
        foreach ($intervals as $interval) {
            $sum = BcMath::add($sum, $interval['quantity']);
        }

        return $sum;
    }

    /** @return array<string, mixed> */
    private function unusableResult(InventoryLot $lot, int $scale): array
    {
        $zero = BcMath::str('0');

        return [
            'stock_lot_id' => $lot->id,
            'source_kind' => self::mapSourceKind($lot->source_type),
            'source_reference' => $lot->source_reference ?: $lot->lot_code,
            'location_id' => $lot->location_id,
            'quantity_scale' => $scale,
            'is_usable_stockroom' => false,
            'usable_stockroom_on_hand' => $zero,
            'active_stock_hold_quantity' => $zero,
            'eligible_usable_stockroom_on_hand' => $zero,
            'eligible_unheld_quantity' => $zero,
            'eligible_free_quantity' => $zero,
            'eligible_bounded_free_quantity' => $zero,
            'eligible_unrestricted_free_quantity' => $zero,
            'ineligible_restricted_quantity' => $zero,
            'uninterpreted_restricted_quantity' => $zero,
            'restriction_state' => 'unusable',
            'free_intervals' => [],
        ];
    }
}
