<?php

declare(strict_types=1);

namespace App\Services\Inventory\Participants;

use App\Exceptions\ContractException;
use App\Models\CatalogueVariant;
use App\Models\InternalRfLine;
use App\Models\InventoryLot;
use App\Models\User;
use App\Services\Authority\ChapterAuthority;
use App\Services\Inventory\InventoryPolicyResolver;
use App\Services\Inventory\RfStockMatcher;
use App\Services\Inventory\StockEligibilityEvaluator;
use App\Services\Inventory\StockViewQueryService;
use App\Services\Shared\BcMath;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

final class ComputeNetShortageSnapshotParticipant implements NetShortageSnapshotParticipant
{
    public function __construct(
        private readonly StockEligibilityEvaluator $eligibility,
        private readonly StockViewQueryService $stockViews,
        private readonly InventoryPolicyResolver $policies,
        private readonly OpenProcurementSupplyProvider $supply,
        private readonly RfStockMatcher $matcher,
    ) {}

    public function computeNetShortageSnapshot(array $input): array
    {
        $chapterId = $input['chapter_id'];
        $actor = User::find($input['actor_id']);
        try {
            $authority = $actor ? ChapterAuthority::forChapter($actor, $chapterId) : null;
        } catch (ContractException $exception) {
            return ['outcome' => 'rejected', 'code' => $exception->errorCode, 'message' => $exception->getMessage()];
        }
        if ($authority === null) {
            return ['outcome' => 'rejected', 'code' => 'chapter_not_found', 'message' => 'Chapter not found.'];
        }

        $requestedIds = $input['variant_ids'];
        $at = CarbonImmutable::parse($input['observed_at'])->utc();
        $observedAt = $at->format('Y-m-d\TH:i:s.u\Z');
        $requested = CatalogueVariant::where('chapter_id', $chapterId)->where('is_active', true)
            ->whereIn('id', $requestedIds)->get()->keyBy('id');
        if ($requested->count() !== count($requestedIds)) {
            return ['outcome' => 'rejected', 'code' => 'resource_not_found', 'message' => 'Active catalogue variant not found.'];
        }

        $policies = $this->policies->lockChapterPolicies($authority, ['quantity_scale', 'rop', 'target_level', 'allocation_priority']);
        $scales = $thresholds = $blockers = [];
        foreach ($requested as $variant) {
            $scalePolicy = $this->policies->resolveQuantityScale($authority, $policies, $variant->id);
            if (! $scalePolicy['effective']) {
                $blockers[] = $scalePolicy['blocker'];

                continue;
            }
            $scales[$variant->id] = $scalePolicy['scale'];
            $threshold = $thresholds[$variant->item_id] ??= $this->policies->resolveItemThresholds(
                $authority, $policies, $variant->item_id,
            );
            if ($scalePolicy['unit_id'] !== $variant->unit_id
                || ($threshold['rop_unit_id'] !== null && $threshold['rop_unit_id'] !== $variant->unit_id)
                || ($threshold['target_level_unit_id'] !== null && $threshold['target_level_unit_id'] !== $variant->unit_id)) {
                return ['outcome' => 'rejected', 'code' => 'unit_mismatch', 'message' => 'Approved policy unit does not match catalogue variant.'];
            }
        }
        if ($input['require_rop_and_target_policies']) {
            foreach ($thresholds as $threshold) {
                array_push($blockers, ...$threshold['blockers']);
            }
        }
        if ($blockers !== []) {
            return ['outcome' => 'setup_blocked', 'blockers' => array_slice($blockers, 0, 50)];
        }

        try {
            $priority = $this->policies->requireAllocationPriority($authority, $policies, $at);
        } catch (ContractException $exception) {
            if ($exception->errorCode !== 'setup_blocked') {
                throw $exception;
            }
            $priority = ['unit_ranks' => [], 'active_overrides' => []];
        }

        // Include sibling variants to apply the item-level target once, even when only one sibling was requested.
        $variants = CatalogueVariant::where('chapter_id', $chapterId)->where('is_active', true)
            ->whereIn('item_id', $requested->pluck('item_id')->unique())
            ->with(['item', 'unit'])->orderBy('code')->orderBy('id')->get();
        $variantIds = $variants->pluck('id')->all();
        $lots = InventoryLot::where('chapter_id', $chapterId)->whereIn('variant_id', $variantIds)
            ->withExists('restrictions')->orderBy('created_at')->orderBy('id')->get();
        $ranges = $this->stockViews->loadLotRanges($lots, protectSales: true);
        $lines = InternalRfLine::whereIn('variant_id', $variantIds)
            ->whereHas('rf', fn ($query) => $query->where('chapter_id', $chapterId)->where('status', 'approved'))
            ->with(['rf', 'reservations' => fn ($query) => $query->active()->where('source_type', 'RF')->with('allocations')])
            ->get();
        $inbound = collect($this->supply->getInboundSourcesForVariants(
            $chapterId, $variantIds, $input['exclude_repf_id'], $observedAt,
        ))->groupBy('variant_id');

        $lotsByVariant = $lots->groupBy('variant_id');
        $linesByVariant = $lines->groupBy('variant_id');
        $summaries = $variants->mapWithKeys(function (CatalogueVariant $variant) use (
            $scales, $lotsByVariant, $linesByVariant, $ranges, $inbound, $priority, $at, $input
        ): array {
            $scale = $scales[$variant->id] ?? $variant->quantity_scale;
            $stock = $this->summarizeStock(
                $variant, $lotsByVariant->get($variant->id, collect()), $ranges,
                $linesByVariant->get($variant->id, collect()), $priority, $at, $scale, $input['include_rf_line_breakdown'],
            );

            return [$variant->id => $stock + $this->summarizeInbound($inbound->get($variant->id, collect()), $variant, $scale)];
        });

        $targets = $this->allocateItemTopUps($variants, $summaries, $thresholds);
        $variants = $variants->keyBy('id');
        $items = [];
        foreach ($requestedIds as $variantId) {
            $variant = $variants[$variantId];
            $summary = $summaries[$variantId];
            $threshold = $thresholds[$variant->item_id];
            $scale = $scales[$variantId];
            $format = fn ($quantity) => BcMath::format($quantity, $scale);
            $target = $targets[$variantId];
            $rfShortage = $summary['unreserved_approved_rf_shortage'];
            $inboundCoverage = $summary['total_open_inbound_coverage'];
            $uncoveredRf = BcMath::max('0', BcMath::sub($rfShortage, $inboundCoverage));
            $inboundAfterRf = BcMath::max('0', BcMath::sub($inboundCoverage, $rfShortage));
            $uncoveredRop = BcMath::max('0', BcMath::sub($target['quantity'], $inboundAfterRf));

            $items[] = [
                'chapter_id' => $chapterId,
                'item_id' => $variant->item_id,
                'item_code' => $variant->item->code,
                'variant_id' => $variantId,
                'variant_code' => $variant->code ?? $variant->sku,
                'display_name' => $variant->label ?: ($variant->name ?: $variant->item->name),
                'unit_id' => $variant->unit_id,
                'unit_code' => $variant->unit->code,
                'quantity_scale' => $scale,
                'approved_rop' => $threshold['approved_rop'] === null ? null : $format($threshold['approved_rop']),
                'rop_policy' => $threshold['rop_policy'],
                'approved_target_level' => $threshold['approved_target_level'] === null ? null : $format($threshold['approved_target_level']),
                'target_level_policy' => $threshold['target_level_policy'],
                'low_stock_breach' => $target['breach'],
                'gross_rf_shortage_need' => $format($rfShortage),
                'gross_rop_replenishment_need' => $format($target['quantity']),
                'gross_combined_need' => $format(BcMath::add($rfShortage, $target['quantity'])),
                'uncovered_rf_shortage_quantity' => $format($uncoveredRf),
                'uncovered_rop_replenishment_quantity' => $format($uncoveredRop),
                'proposed_uncovered_quantity' => $format(BcMath::add($uncoveredRf, $uncoveredRop)),
                'contributing_rf_lines' => $summary['contributing_rf_lines'],
                'inbound_sources' => $summary['inbound_sources'],
                'setup_blockers' => $threshold['blockers'],
                'observed_at' => $observedAt,
            ] + array_map($format, array_diff_key($summary, ['contributing_rf_lines' => true, 'inbound_sources' => true]));
        }

        return [
            'outcome' => 'ready',
            'snapshot_version' => min(2147483647, max(1, (int) $authority->chapter->version
                + (int) $policies->sum('policy_version') + (int) $lots->sum('stock_version')
                + (int) $lines->sum(fn (InternalRfLine $line) => $line->rf->version))),
            'observed_at' => $observedAt,
            'items' => $items,
        ];
    }

    private function summarizeStock(
        CatalogueVariant $variant, Collection $lots, array $ranges, Collection $lines, array $priority,
        CarbonImmutable $at, int $scale, bool $includeLines,
    ): array {
        $onHand = $eligible = $reserved = $available = $unreserved = $shortage = '0';
        $pools = $breakdown = $demands = $legacy = [];
        foreach ($lots->where('unit_id', $variant->unit_id) as $lot) {
            $projection = $this->stockViews->getLotAvailability(
                $lot, $at, null, ranges: $ranges[$lot->id], potentialUses: ['internal_use', 'booth_custody'],
            );
            $onHand = BcMath::add($onHand, $projection['usable_stockroom_on_hand']);
            $eligible = BcMath::add($eligible, $projection['eligible_unheld_quantity']);
            $available = BcMath::add($available, $projection['eligible_free_quantity']);
            $segments = array_column($this->eligibility->segments($lot), 'restrictions', 'basis_segment_id');
            foreach ($projection['free_intervals'] as $range) {
                $pools[] = [
                    'lot' => $lot,
                    'restriction' => $segments[$range['basis_segment_id']],
                    'quantity' => $range['quantity'],
                ];
            }
        }

        foreach ($lines as $line) {
            $rf = $line->rf;
            $lineReserved = '0';
            foreach ($line->reservations as $reservation) {
                $quantity = $reservation->active_quantity ?? $reservation->quantity;
                $lineReserved = BcMath::add($lineReserved, $quantity);
                if ($reservation->allocations->isEmpty() && BcMath::isPositive($quantity)) {
                    $legacy[] = [
                        'quantity' => $quantity,
                        'ranges' => $this->eligibleRanges($pools, $line, $at, $reservation->lot_id),
                    ];
                }
            }
            $reserved = BcMath::add($reserved, $lineReserved);
            $outstanding = BcMath::sub($line->approved_quantity, BcMath::add(
                $lineReserved, BcMath::add($line->issued_quantity, $line->canceled_quantity),
            ));
            if (! BcMath::isPositive($outstanding)) {
                continue;
            }

            $unreserved = BcMath::add($unreserved, $outstanding);
            $override = $priority['active_overrides'][$line->id] ?? null;
            $hasOverride = $override !== null && in_array($override['rf_id'], ['', $rf->id], true);
            $demands[] = [
                'line' => $line,
                'quantity' => $outstanding,
                'reserved' => $lineReserved,
                'ranges' => $this->eligibleRanges($pools, $line, $at),
                'priority' => [
                    BcMath::isPositive($lineReserved) ? 1 : ($hasOverride ? 2 : 3),
                    $priority['unit_ranks'][$rf->requesting_unit_id] ?? PHP_INT_MAX,
                    $rf->needed_at?->getTimestamp() ?? PHP_INT_MAX, $rf->needed_at?->micro ?? 0,
                    $rf->approved_at?->getTimestamp() ?? PHP_INT_MAX, $rf->approved_at?->micro ?? 0,
                    $line->id,
                ],
            ];
        }

        usort($demands, fn (array $a, array $b) => $a['priority'] <=> $b['priority']);
        $uncovered = $this->matcher->uncovered(array_column($pools, 'quantity'), [...$legacy, ...$demands]);
        foreach ($legacy as $index => $commitment) {
            $available = BcMath::sub($available, BcMath::sub($commitment['quantity'], $uncovered[$index]));
        }
        foreach ($demands as $index => $entry) {
            $shortage = BcMath::add($shortage, $uncovered[count($legacy) + $index]);
            if ($includeLines && $index < 200) {
                $line = $entry['line'];
                $rf = $line->rf;
                $breakdown[] = [
                    'rf_id' => $rf->id,
                    'rf_reference' => $rf->rf_number,
                    'rf_line_id' => $line->id,
                    'rf_material_version' => (int) $rf->material_version,
                    'requesting_unit_id' => $rf->requesting_unit_id,
                    'needed_at' => ($rf->needed_at ?? $rf->approved_at ?? $rf->created_at)->utc()->format('Y-m-d\TH:i:s.u\Z'),
                    'approved_quantity' => BcMath::format($line->approved_quantity, $scale),
                    'issued_quantity' => BcMath::format($line->issued_quantity, $scale),
                    'canceled_quantity' => BcMath::format($line->canceled_quantity, $scale),
                    'active_reserved_quantity' => BcMath::format($entry['reserved'], $scale),
                    'unreserved_outstanding_quantity' => BcMath::format($entry['quantity'], $scale),
                ];
            }
        }

        return [
            'usable_stockroom_on_hand' => $onHand,
            'eligible_usable_stockroom_on_hand' => $eligible,
            'active_rf_reservations' => $reserved,
            'eligible_available_to_allocate' => $available,
            'total_unreserved_approved_rf_demand' => $unreserved,
            'unreserved_approved_rf_shortage' => $shortage,
            'contributing_rf_lines' => $breakdown,
        ];
    }

    private function eligibleRanges(array $pools, InternalRfLine $line, CarbonImmutable $at, ?string $lotId = null): array
    {
        $eligible = [];
        foreach ($pools as $index => $pool) {
            $lot = $pool['lot'];
            if ($lot->unit_id === $line->unit_id && ($lotId === null || $lot->id === $lotId)
                && in_array($this->eligibility->restrictionState(
                    $lot, $pool['restriction'], (bool) $lot->restrictions_exists, $line->rf->purpose, $at, $line->rf,
                ), ['unrestricted', 'bounded'], true)) {
                $eligible[] = $index;
            }
        }

        return $eligible;
    }

    private function summarizeInbound(Collection $sources, CatalogueVariant $variant, int $scale): array
    {
        $repf = $po = $excluded = '0';
        $details = [];
        foreach ($sources->where('unit_id', $variant->unit_id)->sortBy([
            ['source_kind', 'asc'], ['source_reference', 'asc'], ['source_id', 'asc'], ['coverage_state', 'asc'], ['exclusion_reason', 'asc'],
        ]) as $source) {
            $quantity = $source['open_quantity'];
            if ($source['coverage_state'] !== 'counted') {
                $excluded = BcMath::add($excluded, $quantity);
            } elseif ($source['source_kind'] === 'repf') {
                $repf = BcMath::add($repf, $quantity);
            } else {
                $po = BcMath::add($po, $quantity);
            }

            if (count($details) < 200 && $source['source_reference'] !== null) {
                $source['open_quantity'] = BcMath::format($quantity, $scale);
                $details[] = array_diff_key($source, ['variant_id' => true, 'unit_id' => true]);
            }
        }

        return [
            'open_repf_quantity' => $repf,
            'open_po_inbound_quantity' => $po,
            'total_open_inbound_coverage' => BcMath::add($repf, $po),
            'excluded_inbound_quantity' => $excluded,
            'inbound_sources' => $details,
        ];
    }

    private function allocateItemTopUps(Collection $variants, Collection $summaries, array $thresholds): array
    {
        $targets = [];
        foreach ($variants->groupBy(fn (CatalogueVariant $variant) => $variant->item_id.'|'.$variant->unit_id) as $siblings) {
            $primary = $siblings->first();
            $threshold = $thresholds[$primary->item_id];
            $onHand = $postRf = '0';
            foreach ($siblings as $variant) {
                $summary = $summaries[$variant->id];
                $onHand = BcMath::add($onHand, $summary['usable_stockroom_on_hand']);
                $postRf = BcMath::add($postRf, BcMath::sub(
                    $summary['eligible_available_to_allocate'], $summary['total_unreserved_approved_rf_demand'],
                ));
            }

            $breach = $threshold['rop_unit_id'] === $primary->unit_id
                && BcMath::comp($onHand, $threshold['approved_rop']) <= 0;
            $remaining = $breach && $threshold['target_level_unit_id'] === $primary->unit_id
                ? BcMath::max('0', BcMath::sub($threshold['approved_target_level'], BcMath::max('0', $postRf)))
                : '0';

            foreach ($siblings as $variant) {
                $summary = $summaries[$variant->id];
                $leftoverInbound = BcMath::max('0', BcMath::sub(
                    $summary['total_open_inbound_coverage'], $summary['unreserved_approved_rf_shortage'],
                ));
                $topUp = BcMath::min($remaining, $leftoverInbound);
                $targets[$variant->id] = ['breach' => $breach, 'quantity' => $topUp];
                $remaining = BcMath::sub($remaining, $topUp);
            }
            $targets[$primary->id]['quantity'] = BcMath::add($targets[$primary->id]['quantity'], $remaining);
        }

        return $targets;
    }
}
