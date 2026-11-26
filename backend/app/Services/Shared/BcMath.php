<?php

namespace App\Services\Shared;

use App\Exceptions\ContractException;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;

class BcMath
{
    public const SCALE = 6;

    public static function str(int|float|string|null $value, int $scale = self::SCALE): string
    {
        if ($value === null || $value === '') {
            return (string) BigDecimal::zero()->toScale($scale, RoundingMode::Down);
        }

        if (is_int($value)) {
            return (string) BigDecimal::of($value)->toScale($scale, RoundingMode::Down);
        }

        if (is_float($value)) {
            return (string) BigDecimal::of(number_format($value, $scale, '.', ''))->toScale($scale, RoundingMode::Down);
        }

        $trimmed = trim($value);
        if ($trimmed === '') {
            return (string) BigDecimal::zero()->toScale($scale, RoundingMode::Down);
        }

        return (string) BigDecimal::of($trimmed)->toScale($scale, RoundingMode::Down);
    }

    public static function add(int|float|string|null $a, int|float|string|null $b, int $scale = self::SCALE): string
    {
        return (string) BigDecimal::of(self::str($a, $scale))
            ->plus(self::str($b, $scale))
            ->toScale($scale, RoundingMode::Down);
    }

    public static function sub(int|float|string|null $a, int|float|string|null $b, int $scale = self::SCALE): string
    {
        return (string) BigDecimal::of(self::str($a, $scale))
            ->minus(self::str($b, $scale))
            ->toScale($scale, RoundingMode::Down);
    }

    public static function mul(int|float|string|null $a, int|float|string|null $b, int $scale = self::SCALE): string
    {
        return (string) BigDecimal::of(self::str($a, $scale))
            ->multipliedBy(self::str($b, $scale))
            ->toScale($scale, RoundingMode::Down);
    }

    public static function comp(int|float|string|null $a, int|float|string|null $b, int $scale = self::SCALE): int
    {
        return BigDecimal::of(self::str($a, $scale))->compareTo(self::str($b, $scale));
    }

    public static function max(int|float|string|null $a, int|float|string|null $b, int $scale = self::SCALE): string
    {
        $sa = self::str($a, $scale);
        $sb = self::str($b, $scale);

        return self::comp($sa, $sb, $scale) >= 0 ? $sa : $sb;
    }

    public static function min(int|float|string|null $a, int|float|string|null $b, int $scale = self::SCALE): string
    {
        $sa = self::str($a, $scale);
        $sb = self::str($b, $scale);

        return self::comp($sa, $sb, $scale) <= 0 ? $sa : $sb;
    }

    public static function isZero(int|float|string|null $value, int $scale = self::SCALE): bool
    {
        return self::comp($value, '0', $scale) === 0;
    }

    public static function isPositive(int|float|string|null $value, int $scale = self::SCALE): bool
    {
        return self::comp($value, '0', $scale) > 0;
    }

    /**
     * Format a decimal string cleanly for API StockQuantity responses.
     * When displayScale is 0 and value is integral, returns "10" (no trailing .000000).
     */
    public static function format(int|float|string|null $value, int $displayScale = 0): string
    {
        $norm = self::str($value, self::SCALE);
        if ($displayScale <= 0) {
            $stripped = rtrim(rtrim($norm, '0'), '.');

            return $stripped === '' || $stripped === '-0' ? '0' : $stripped;
        }

        return (string) BigDecimal::of($norm)->toScale($displayScale, RoundingMode::Down);
    }

    /**
     * Compute exact union length of half-open intervals [offset, offset + quantity).
     *
     * @param  array<int, array{offset: string|int|float, quantity: string|int|float}>  $intervals
     */
    public static function intervalUnionLength(array $intervals): string
    {
        $segments = [];
        foreach ($intervals as $interval) {
            $start = self::str($interval['offset'] ?? $interval['offset_quantity'] ?? '0');
            $qty = self::str($interval['quantity'] ?? '0');
            if (self::comp($qty, '0') <= 0) {
                continue;
            }
            $end = self::add($start, $qty);
            $segments[] = ['start' => $start, 'end' => $end];
        }

        if ($segments === []) {
            return self::str('0');
        }

        usort($segments, function (array $a, array $b): int {
            $cmp = self::comp($a['start'], $b['start'], self::SCALE);
            if ($cmp !== 0) {
                return $cmp;
            }

            return self::comp($a['end'], $b['end'], self::SCALE);
        });

        $merged = [$segments[0]];
        for ($i = 1, $count = count($segments); $i < $count; $i++) {
            $lastIdx = count($merged) - 1;
            if (self::comp($segments[$i]['start'], $merged[$lastIdx]['end'], self::SCALE) <= 0) {
                if (self::comp($segments[$i]['end'], $merged[$lastIdx]['end'], self::SCALE) > 0) {
                    $merged[$lastIdx]['end'] = $segments[$i]['end'];
                }
            } else {
                $merged[] = $segments[$i];
            }
        }

        $total = self::str('0');
        foreach ($merged as $seg) {
            $total = self::add($total, self::sub($seg['end'], $seg['start']));
        }

        return $total;
    }

    /**
     * Check whether two half-open intervals [startA, endA) and [startB, endB) overlap.
     */
    public static function intervalsOverlap(
        string|int|float $offsetA,
        string|int|float $qtyA,
        string|int|float $offsetB,
        string|int|float $qtyB
    ): bool {
        $startA = self::str($offsetA);
        $endA = self::add($startA, $qtyA);
        $startB = self::str($offsetB);
        $endB = self::add($startB, $qtyB);

        if (self::comp($qtyA, '0') <= 0 || self::comp($qtyB, '0') <= 0) {
            return false;
        }

        $maxStart = self::max($startA, $startB);
        $minEnd = self::min($endA, $endB);

        return self::comp($maxStart, $minEnd) < 0;
    }

    /**
     * Return intersection intervals of two interval lists (grouped on the same lot+segment).
     *
     * @param  array<int, array{offset: string|int|float, quantity: string|int|float}>  $aList
     * @param  array<int, array{offset: string|int|float, quantity: string|int|float}>  $bList
     * @return array<int, array{offset: string, quantity: string}>
     */
    public static function intersectIntervalLists(array $aList, array $bList): array
    {
        $intersections = [];
        foreach ($aList as $a) {
            $startA = self::str($a['offset'] ?? $a['offset_quantity'] ?? '0');
            $qtyA = self::str($a['quantity'] ?? '0');
            if (self::comp($qtyA, '0') <= 0) {
                continue;
            }
            $endA = self::add($startA, $qtyA);

            foreach ($bList as $b) {
                $startB = self::str($b['offset'] ?? $b['offset_quantity'] ?? '0');
                $qtyB = self::str($b['quantity'] ?? '0');
                if (self::comp($qtyB, '0') <= 0) {
                    continue;
                }
                $endB = self::add($startB, $qtyB);

                $maxStart = self::max($startA, $startB);
                $minEnd = self::min($endA, $endB);
                if (self::comp($maxStart, $minEnd) < 0) {
                    $intersections[] = [
                        'offset' => $maxStart,
                        'quantity' => self::sub($minEnd, $maxStart),
                    ];
                }
            }
        }

        return $intersections;
    }

    /**
     * Check if half-open interval inner [offsetInner, offsetInner + qtyInner) is contained within outer.
     */
    public static function intervalContains(
        string|int|float $offsetOuter,
        string|int|float $qtyOuter,
        string|int|float $offsetInner,
        string|int|float $qtyInner
    ): bool {
        $startOuter = self::str($offsetOuter);
        $endOuter = self::add($startOuter, $qtyOuter);
        $startInner = self::str($offsetInner);
        $endInner = self::add($startInner, $qtyInner);

        return self::comp($startInner, $startOuter) >= 0
            && self::comp($endInner, $endOuter) <= 0
            && self::comp($qtyInner, '0') > 0;
    }

    /**
     * Validate that all intervals in a single request have non-negative offsets,
     * positive quantities, and are pairwise disjoint per (stock_lot_id, basis_segment_id).
     *
     * @param  array<int, array<string, mixed>>  $targets
     *
     * @throws ContractException
     */
    public static function assertDisjointIntervals(array $targets): void
    {
        $byGroup = [];

        foreach ($targets as $idx => $target) {
            $offsetRaw = $target['offset_quantity'] ?? '0';
            $qtyRaw = $target['quantity'] ?? '0';

            if (is_numeric((string) $offsetRaw) === false || self::comp($offsetRaw, '0') < 0) {
                throw new ContractException(422, 'invalid_input', "Target {$idx} offset_quantity must be >= 0.");
            }
            if (is_numeric((string) $qtyRaw) === false || self::comp($qtyRaw, '0') <= 0) {
                throw new ContractException(422, 'invalid_input', "Target {$idx} quantity must be > 0.");
            }

            $lotId = (string) ($target['stock_lot_id'] ?? $target['lot_id'] ?? '');
            $segId = (string) ($target['basis_segment_id'] ?? $lotId);
            $groupKey = "{$lotId}|{$segId}";

            $start = self::str($offsetRaw);
            $end = self::add($start, $qtyRaw);
            $byGroup[$groupKey][] = ['start' => $start, 'end' => $end];
        }

        foreach ($byGroup as $intervals) {
            if (count($intervals) < 2) {
                continue;
            }

            usort($intervals, function (array $a, array $b): int {
                $cmp = self::comp($a['start'], $b['start'], self::SCALE);

                return $cmp !== 0 ? $cmp : self::comp($a['end'], $b['end'], self::SCALE);
            });

            for ($i = 1, $count = count($intervals); $i < $count; $i++) {
                if (self::comp($intervals[$i]['start'], $intervals[$i - 1]['end'], self::SCALE) < 0) {
                    throw new ContractException(
                        422,
                        'invalid_input',
                        'Target intervals within a single request must be pairwise disjoint.'
                    );
                }
            }
        }
    }
}
