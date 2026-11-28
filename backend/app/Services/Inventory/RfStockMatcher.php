<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Services\Shared\BcMath;

final class RfStockMatcher
{
    /**
     * @param  list<string>  $capacity  Free quantities by stock range
     * @param  list<array{quantity: string, ranges: list<int>}>  $demand  In RF priority order
     * @return list<string> Uncovered quantity by demand line
     */
    public function uncovered(array $capacity, array $demand): array
    {
        $assigned = [];
        $uncovered = [];

        foreach ($demand as $line => $entry) {
            $remaining = $entry['quantity'];
            while (BcMath::isPositive($remaining)) {
                // Follow existing assignments back to earlier lines to find a free substitute range.
                $lineFromRange = [$line => null];
                $rangeFromLine = [];
                $queue = [$line];
                $freeRange = null;

                for ($index = 0; $index < count($queue) && $freeRange === null; $index++) {
                    $candidate = $queue[$index];
                    foreach ($demand[$candidate]['ranges'] as $range) {
                        if (isset($rangeFromLine[$range])) {
                            continue;
                        }
                        $rangeFromLine[$range] = $candidate;
                        if (BcMath::isPositive($capacity[$range])) {
                            $freeRange = $range;
                            break;
                        }
                        foreach ($assigned[$range] ?? [] as $other => $quantity) {
                            if (! array_key_exists($other, $lineFromRange)) {
                                $lineFromRange[$other] = $range;
                                $queue[] = $other;
                            }
                        }
                    }
                }

                if ($freeRange === null) {
                    break;
                }

                $take = BcMath::min($remaining, $capacity[$freeRange]);
                for ($range = $freeRange; ($previous = $lineFromRange[$rangeFromLine[$range]]) !== null; $range = $previous) {
                    $take = BcMath::min($take, $assigned[$previous][$rangeFromLine[$range]]);
                }

                $capacity[$freeRange] = BcMath::sub($capacity[$freeRange], $take);
                $range = $freeRange;
                while (true) {
                    $recipient = $rangeFromLine[$range];
                    $assigned[$range][$recipient] = BcMath::add($assigned[$range][$recipient] ?? '0', $take);
                    $previous = $lineFromRange[$recipient];
                    if ($previous === null) {
                        break;
                    }
                    $assigned[$previous][$recipient] = BcMath::sub($assigned[$previous][$recipient], $take);
                    if (BcMath::isZero($assigned[$previous][$recipient])) {
                        unset($assigned[$previous][$recipient]);
                    }
                    $range = $previous;
                }
                $remaining = BcMath::sub($remaining, $take);
            }
            $uncovered[] = $remaining;
        }

        return $uncovered;
    }
}
