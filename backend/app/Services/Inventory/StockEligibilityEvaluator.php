<?php

namespace App\Services\Inventory;

use App\Models\InternalRf;
use App\Models\InventoryLot;
use App\Services\Inventory\Participants\DonationRestrictionSupport;
use App\Services\Shared\BcMath;
use Carbon\CarbonInterface;

final class StockEligibilityEvaluator
{
    public function segments(InventoryLot $lot): array
    {
        $basis = BcMath::str($lot->original_quantity ?? $lot->quantity_on_hand);
        $segments = $lot->segments ?: [[
            'basis_segment_id' => $lot->basis_segment_id ?? $lot->id,
            'offset_quantity' => '0',
            'quantity' => $basis,
        ]];

        $result = [];
        foreach ($segments as $segment) {
            $id = $segment['basis_segment_id'] ?? $segment['id'] ?? null;
            $offset = $segment['offset_quantity'] ?? '0';
            $quantity = $segment['quantity'] ?? '0';
            if (is_string($id) && BcMath::isPositive($quantity)
                && BcMath::intervalContains('0', $basis, $offset, $quantity)) {
                $result[] = [
                    'basis_segment_id' => $id,
                    'offset' => $offset,
                    'quantity' => $quantity,
                    'restrictions' => $segment['restrictions'] ?? $lot->restrictions_json,
                ];
            }
        }

        return $result;
    }

    public function restrictionState(
        InventoryLot $lot,
        mixed $restriction,
        bool $legacyRestriction,
        string $use,
        CarbonInterface $at,
        ?InternalRf $rf = null,
        ?string $requestingUnitId = null,
        ?string $eventId = null,
        ?CarbonInterface $neededAt = null,
    ): string {
        if (! ($lot->immediately_allocatable ?? true)
            || $legacyRestriction
            || ($restriction === null && in_array($lot->restriction_state, ['bounded', 'uninterpreted'], true))) {
            return 'uninterpreted';
        }
        if (in_array(strtoupper($lot->source_kind ?? $lot->source_type ?? ''), ['IPC', 'IPC_RM', 'OPENING_RM'], true)
            && is_array($restriction) && ($restriction['state'] ?? null) === 'unrestricted'
            && is_array($restriction['allowed_uses'] ?? null) && count($restriction['allowed_uses']) === 3
            && array_diff(['internal_use', 'sale', 'booth_custody'], $restriction['allowed_uses']) === []) {
            // Legacy Opening RM records explicitly listed every use for unrestricted stock.
            $restriction['allowed_uses'] = [];
        }
        if ($restriction === null || DonationRestrictionSupport::isStrictlyUnrestricted($restriction)) {
            return 'unrestricted';
        }
        if (! DonationRestrictionSupport::isValid($restriction, ['bounded'])) {
            return 'uninterpreted';
        }

        $matches = DonationRestrictionSupport::allowsUse(
            $restriction,
            strtolower($use),
            $rf?->requesting_unit_id ?? $requestingUnitId,
            $rf?->event_id ?? $eventId,
            $at,
            $rf?->needed_at ?? $neededAt,
        );

        return $matches ? 'bounded' : 'ineligible_bounded';
    }

    /**
     * Project each lot's on-hand and free ranges in its original basis coordinates.
     * A general stock view counts bounded stock only if it is usable for at least one permitted use.
     */
    public function project(
        InventoryLot $lot,
        array $consumed,
        array $holds,
        array $reservations,
        bool $legacyRestriction,
        CarbonInterface $at,
        ?string $use,
        ?InternalRf $rf = null,
        ?string $requestingUnitId = null,
        ?string $eventId = null,
        ?CarbonInterface $neededAt = null,
    ): array {
        $projection = [
            'usable_stockroom_on_hand' => BcMath::str('0'),
            'active_stock_hold_quantity' => BcMath::str('0'),
            'ineligible_restricted_quantity' => BcMath::str('0'),
            'uninterpreted_restricted_quantity' => BcMath::str('0'),
            'eligible_free_quantity' => BcMath::str('0'),
            'restriction_state' => 'unrestricted',
            'free_intervals' => [],
        ];
        if (strtoupper($lot->condition) !== 'USABLE' || strtoupper($lot->custody) !== 'STOCKROOM') {
            return $projection;
        }
        $projection['usable_stockroom_on_hand'] = BcMath::str($lot->quantity_on_hand);
        $projection['active_stock_hold_quantity'] = BcMath::sub(
            $lot->quantity_on_hand,
            BcMath::intervalUnionLength($this->subtract(
                [['offset' => '0', 'quantity' => BcMath::str($lot->original_quantity ?? $lot->quantity_on_hand)]],
                [...$consumed, ...$holds],
            )),
        );
        $projection['active_stock_hold_quantity'] = BcMath::max('0', $projection['active_stock_hold_quantity']);

        foreach ($this->segments($lot) as $segment) {
            $restriction = $segment['restrictions'];
            $state = $this->restrictionState(
                $lot, $restriction, $legacyRestriction, $use ?? '', $at, $rf, $requestingUnitId, $eventId, $neededAt,
            );
            if ($use === null && $state === 'ineligible_bounded'
                && DonationRestrictionSupport::allowsAnyUse($restriction, $at)) {
                $state = 'bounded';
            }

            $onHand = $this->subtract([$segment], $consumed);
            if ($state === 'uninterpreted' || $state === 'ineligible_bounded') {
                $key = $state === 'uninterpreted' ? 'uninterpreted_restricted_quantity' : 'ineligible_restricted_quantity';
                $projection[$key] = BcMath::add($projection[$key], BcMath::intervalUnionLength($onHand));

                continue;
            }

            foreach ($this->subtract($onHand, [...$holds, ...$reservations]) as $range) {
                $projection['free_intervals'][] = [
                    'basis_segment_id' => $segment['basis_segment_id'],
                    'offset_quantity' => BcMath::format($range['offset'], $lot->quantity_scale ?? 0),
                    'quantity' => BcMath::format($range['quantity'], $lot->quantity_scale ?? 0),
                ];
                $projection['eligible_free_quantity'] = BcMath::add($projection['eligible_free_quantity'], $range['quantity']);
                if ($state === 'bounded') {
                    $projection['restriction_state'] = 'bounded';
                }
            }
        }

        if (! BcMath::isPositive($projection['eligible_free_quantity'])) {
            if (BcMath::isPositive($projection['uninterpreted_restricted_quantity'])) {
                $projection['restriction_state'] = 'uninterpreted';
            } elseif (BcMath::isPositive($projection['ineligible_restricted_quantity'])) {
                $projection['restriction_state'] = 'bounded';
            }
        }

        return $projection;
    }

    /** Subtract every blocked interval from the given ranges. */
    private function subtract(array $ranges, array $blocked): array
    {
        foreach ($blocked as $block) {
            $remaining = [];
            foreach ($ranges as $range) {
                $start = $range['offset'];
                $end = BcMath::add($start, $range['quantity']);
                $blockStart = $block['offset'];
                $blockEnd = BcMath::add($blockStart, $block['quantity']);
                if (! BcMath::intervalsOverlap($start, $range['quantity'], $blockStart, $block['quantity'])) {
                    $remaining[] = $range;

                    continue;
                }
                if (BcMath::comp($start, $blockStart) < 0) {
                    $remaining[] = ['offset' => $start, 'quantity' => BcMath::sub($blockStart, $start)];
                }
                if (BcMath::comp($blockEnd, $end) < 0) {
                    $remaining[] = ['offset' => $blockEnd, 'quantity' => BcMath::sub($end, $blockEnd)];
                }
            }
            $ranges = $remaining;
        }

        return $ranges;
    }
}
