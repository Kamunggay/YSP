<?php

declare(strict_types=1);

namespace App\Services\Inventory\Participants;

use App\Exceptions\ContractException;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\InternalRfLine;
use App\Models\InventoryLot;
use App\Models\StockReservation;
use App\Services\Authority\ChapterAuthority;
use App\Services\Inventory\InventoryPolicyResolver;
use App\Services\Inventory\StockEligibilityEvaluator;
use App\Services\Shared\BcMath;
use Carbon\CarbonImmutable;

/**
 * Synchronous internal participant computing live non-overlapping net-shortage
 * and ROP replenishment items for Stage 2A listReplenishmentNeeds and Sam's RepF writes.
 */
final class ComputeNetShortageSnapshotParticipant implements NetShortageSnapshotParticipant
{
    public function __construct(
        private readonly StockEligibilityEvaluator $eligibilityEvaluator,
        private readonly InventoryPolicyResolver $policyResolver,
        private readonly OpenProcurementSupplyProvider $supplyProvider,
    ) {}

    public function computeNetShortageSnapshot(array $input): array
    {
        $chapterId = (string) ($input['chapter_id'] ?? '');
        $actorId = (string) ($input['actor_id'] ?? '');
        $observedAtStr = (string) ($input['observed_at'] ?? now('UTC')->format('Y-m-d\TH:i:s.u\Z'));
        $variantIds = array_values(array_unique(array_map('strval', $input['variant_ids'] ?? [])));
        $includeRfLineBreakdown = (bool) ($input['include_rf_line_breakdown'] ?? true);
        $requireRopAndTarget = (bool) ($input['require_rop_and_target_policies'] ?? false);
        $excludeRepfId = isset($input['exclude_repf_id']) ? (string) $input['exclude_repf_id'] : null;

        if ($variantIds === []) {
            return [
                'outcome' => 'rejected',
                'code' => 'resource_not_found',
                'message' => 'At least one variant_id is required.',
            ];
        }

        $chapter = Chapter::whereKey($chapterId)
            ->whereIn('status', ChapterAuthority::AVAILABLE_CHAPTERS)
            ->sharedLock()
            ->first();

        if (! $chapter) {
            return [
                'outcome' => 'rejected',
                'code' => 'chapter_not_found',
                'message' => 'Chapter not found.',
            ];
        }

        $membership = $chapter->memberships()
            ->where('user_id', $actorId)
            ->current()
            ->sharedLock()
            ->first();

        if (! $membership) {
            return [
                'outcome' => 'rejected',
                'code' => 'chapter_not_found',
                'message' => 'Chapter membership not found.',
            ];
        }

        $authority = ChapterAuthority::fromMembership($membership, $chapter);
        $observedAt = CarbonImmutable::parse($observedAtStr)->utc();
        $observedFormatted = $observedAt->format('Y-m-d\TH:i:s.u\Z');

        $requestedVariants = CatalogueVariant::where('chapter_id', $chapterId)
            ->whereIn('id', $variantIds)
            ->with(['item', 'unit'])
            ->get()
            ->keyBy('id');

        foreach ($variantIds as $requestedId) {
            if (! $requestedVariants->has($requestedId)) {
                return [
                    'outcome' => 'rejected',
                    'code' => 'resource_not_found',
                    'message' => "Variant {$requestedId} was not found in chapter {$chapterId}.",
                ];
            }
        }

        // Load sibling active variants for any item so multi-variant item ROP/target evaluations never multiply target stock levels.
        $itemIds = $requestedVariants->pluck('item_id')->filter()->unique()->values()->all();
        $allItemVariants = CatalogueVariant::where('chapter_id', $chapterId)
            ->whereIn('item_id', $itemIds)
            ->where(function ($q) use ($variantIds) {
                $q->where('is_active', true)->orWhereIn('id', $variantIds);
            })
            ->with(['item', 'unit'])
            ->orderBy('id')
            ->sharedLock()
            ->get();

        $allVariantIds = $allItemVariants->pluck('id')->unique()->values()->all();
        $policies = $this->policyResolver->lockChapterPolicies($authority, [
            'quantity_scale',
            'rop',
            'target_level',
            'allocation_priority',
        ]);

        // Validate quantity_scale policy for every requested variant first
        $scaleInfoByVariant = [];
        $setupBlockers = [];
        foreach ($variantIds as $vId) {
            $variant = $requestedVariants->get($vId);
            $qs = $this->policyResolver->resolveQuantityScale($authority, $policies, $vId);
            if (! $qs['effective']) {
                $setupBlockers[] = $qs['blocker'];

                continue;
            }
            if (($qs['unit_id'] ?? null) !== $variant->unit_id) {
                return [
                    'outcome' => 'rejected',
                    'code' => 'unit_mismatch',
                    'message' => "Variant {$vId} unit does not match approved quantity_scale policy.",
                ];
            }
            $scaleInfoByVariant[$vId] = $qs;
        }

        if ($setupBlockers !== []) {
            return [
                'outcome' => 'setup_blocked',
                'blockers' => $setupBlockers,
            ];
        }

        // Resolve thresholds per item; enforce strict setup_blocked when $requireRopAndTarget is true
        $thresholdsByItem = [];
        $itemSetupBlockers = [];
        foreach ($variantIds as $vId) {
            $variant = $requestedVariants->get($vId);
            $itemId = (string) $variant->item_id;
            if (isset($thresholdsByItem[$itemId])) {
                continue;
            }
            $scale = (int) $scaleInfoByVariant[$vId]['scale'];
            $threshold = $this->policyResolver->resolveItemThresholds($authority, $policies, $itemId, $scale);

            if ($threshold['rop_unit_id'] !== null && $threshold['rop_unit_id'] !== $variant->unit_id) {
                return [
                    'outcome' => 'rejected',
                    'code' => 'unit_mismatch',
                    'message' => "Approved ROP policy unit does not match variant {$vId} unit.",
                ];
            }
            if ($threshold['target_unit_id'] !== null && $threshold['target_unit_id'] !== $variant->unit_id) {
                return [
                    'outcome' => 'rejected',
                    'code' => 'unit_mismatch',
                    'message' => "Approved target_level policy unit does not match variant {$vId} unit.",
                ];
            }

            $thresholdsByItem[$itemId] = $threshold;
            if ($requireRopAndTarget && $threshold['blockers'] !== []) {
                foreach ($threshold['blockers'] as $b) {
                    $itemSetupBlockers[] = $b;
                }
            }
        }

        if ($requireRopAndTarget && $itemSetupBlockers !== []) {
            return [
                'outcome' => 'setup_blocked',
                'blockers' => $itemSetupBlockers,
            ];
        }

        // Load allocation priority cleanly when available (non-blocking fallback to default rank if absent)
        try {
            $allocPolicy = $this->policyResolver->requireAllocationPriority($authority, $policies, $observedAt);
        } catch (ContractException) {
            $allocPolicy = ['unit_ranks' => [], 'active_overrides' => []];
        }

        // Lock inventory lots, RF lines, and active RF reservations for involved variants
        $lots = InventoryLot::where('chapter_id', $chapterId)
            ->whereIn('variant_id', $allVariantIds)
            ->orderBy('created_at')
            ->orderBy('id')
            ->sharedLock()
            ->get();
        $preloaded = $this->eligibilityEvaluator->preloadLots($chapterId, $lots);

        $approvedRfLines = InternalRfLine::whereIn('variant_id', $allVariantIds)
            ->whereHas('rf', fn ($q) => $q->where('chapter_id', $chapterId)->where('status', 'approved'))
            ->with(['rf', 'reservations' => fn ($q) => $q->where('status', 'ACTIVE')])
            ->orderBy('id')
            ->sharedLock()
            ->get();

        // Active RF reservations directly (includes reservations linked to RF lines)
        $activeRfResByVariant = [];
        $activeResRows = StockReservation::where('chapter_id', $chapterId)
            ->where('status', 'ACTIVE')
            ->where('source_type', 'RF')
            ->whereHas('rfLine', fn ($q) => $q->whereIn('variant_id', $allVariantIds))
            ->with('rfLine')
            ->sharedLock()
            ->get();
        foreach ($activeResRows as $res) {
            $vId = (string) $res->rfLine->variant_id;
            $activeRfResByVariant[$vId] = BcMath::add(
                $activeRfResByVariant[$vId] ?? '0',
                BcMath::str($res->active_quantity ?? $res->quantity)
            );
        }

        // Inbound sources from live provider
        $inboundRaw = $this->supplyProvider->getInboundSourcesForVariants(
            $chapterId,
            $allVariantIds,
            $excludeRepfId,
            $observedFormatted
        );
        $inboundByVariant = [];
        foreach ($inboundRaw as $source) {
            $vId = (string) $source['variant_id'];
            $inboundByVariant[$vId][] = $source;
        }

        // Per-variant base stock metrics & lot pool
        $lotsByVariant = $lots->groupBy('variant_id');
        $rfLinesByVariant = $approvedRfLines->groupBy('variant_id');
        $variantSummaries = [];

        foreach ($allItemVariants as $variant) {
            $vId = $variant->id;
            $scale = isset($scaleInfoByVariant[$vId])
                ? (int) $scaleInfoByVariant[$vId]['scale']
                : (int) ($variant->quantity_scale ?? 0);

            $variantLots = $lotsByVariant->get($vId, collect());
            $usableOnHand = BcMath::str('0');
            $eligibleUnheldOnHand = BcMath::str('0');
            $lotFreePools = [];

            foreach ($variantLots as $lot) {
                $eval = $this->eligibilityEvaluator->evaluateLot($lot, null, $observedAt, $preloaded);
                if (! $eval['is_usable_stockroom']) {
                    continue;
                }
                $usableOnHand = BcMath::add($usableOnHand, $eval['usable_stockroom_on_hand']);
                $eligibleUnheldOnHand = BcMath::add($eligibleUnheldOnHand, $eval['eligible_unheld_quantity']);
                $lotFreePools[$lot->id] = $lot;
            }

            $activeRfRes = $activeRfResByVariant[$vId] ?? BcMath::str('0');
            $eligibleAvail = BcMath::sub($eligibleUnheldOnHand, $activeRfRes);
            if (BcMath::comp($eligibleAvail, '0') < 0) {
                $eligibleAvail = BcMath::str('0');
            }

            // Sort open RF lines for this variant in INV-09 order and match bounded/unrestricted lot supply per RF line
            $openLines = [];
            $totalUnreservedDemand = BcMath::str('0');
            foreach ($rfLinesByVariant->get($vId, collect()) as $rfLine) {
                $rf = $rfLine->rf;
                if (! $rf) {
                    continue;
                }
                $approvedQty = BcMath::str($rfLine->approved_quantity ?? '0');
                $issuedQty = BcMath::str($rfLine->issued_quantity ?? '0');
                $canceledQty = BcMath::str($rfLine->canceled_quantity ?? '0');
                $lineActiveReserved = BcMath::str('0');
                foreach ($rfLine->reservations as $res) {
                    $lineActiveReserved = BcMath::add($lineActiveReserved, BcMath::str($res->active_quantity ?? $res->quantity));
                }

                $unreserved = BcMath::sub(
                    $approvedQty,
                    BcMath::add($issuedQty, BcMath::add($canceledQty, $lineActiveReserved))
                );
                if (! BcMath::isPositive($unreserved)) {
                    continue;
                }

                $totalUnreservedDemand = BcMath::add($totalUnreservedDemand, $unreserved);
                $isActiveCommit = BcMath::isPositive($lineActiveReserved);
                $isOverride = isset($allocPolicy['active_overrides'][$rfLine->id]);
                $tierOrder = $isActiveCommit ? 1 : ($isOverride ? 2 : 3);
                $rank = $allocPolicy['unit_ranks'][$rf->requesting_unit_id] ?? 1000;

                $openLines[] = [
                    'rf' => $rf,
                    'rf_line' => $rfLine,
                    'tier_order' => $tierOrder,
                    'rank' => $rank,
                    'needed_at' => $rf->needed_at?->utc()->format('Y-m-d\TH:i:s.u\Z') ?? '9999-12-31T23:59:59.000000Z',
                    'approved_at' => $rf->approved_at?->utc()->format('Y-m-d\TH:i:s.u\Z') ?? '9999-12-31T23:59:59.000000Z',
                    'rf_line_id' => $rfLine->id,
                    'approved_qty' => $approvedQty,
                    'issued_qty' => $issuedQty,
                    'canceled_qty' => $canceledQty,
                    'active_reserved_qty' => $lineActiveReserved,
                    'unreserved_qty' => $unreserved,
                ];
            }

            usort($openLines, function (array $a, array $b): int {
                return [$a['tier_order'], $a['rank'], $a['needed_at'], $a['approved_at'], $a['rf_line_id']]
                    <=> [$b['tier_order'], $b['rank'], $b['needed_at'], $b['approved_at'], $b['rf_line_id']];
            });

            // Per-RF matching preserving unit/event-restricted stock separately from general unrestricted stock
            $lotBoundedRemaining = [];
            $lotUnrestrictedRemaining = [];
            foreach ($lotFreePools as $lotId => $lot) {
                $baseEval = $this->eligibilityEvaluator->evaluateLot($lot, null, $observedAt, $preloaded);
                $lotBoundedRemaining[$lotId] = $baseEval['eligible_bounded_free_quantity'];
                $lotUnrestrictedRemaining[$lotId] = $baseEval['eligible_unrestricted_free_quantity'];
            }

            $totalShortageFromMatching = BcMath::str('0');
            $contributingRfLines = [];

            foreach ($openLines as $entry) {
                $rf = $entry['rf'];
                $need = $entry['unreserved_qty'];

                // Consume matching bounded pools first so general unrestricted pools stay available for general demand
                foreach ($lotFreePools as $lotId => $lot) {
                    if (! BcMath::isPositive($need)) {
                        break;
                    }
                    $boundedPool = $lotBoundedRemaining[$lotId] ?? '0';
                    if (! BcMath::isPositive($boundedPool)) {
                        continue;
                    }
                    $rfEval = $this->eligibilityEvaluator->evaluateLot($lot, $rf, $observedAt, $preloaded);
                    $usableForRf = $rfEval['eligible_bounded_free_quantity'];
                    if (! BcMath::isPositive($usableForRf)) {
                        continue;
                    }
                    $avail = BcMath::min($boundedPool, $usableForRf);
                    $take = BcMath::min($need, $avail);
                    if (BcMath::isPositive($take)) {
                        $lotBoundedRemaining[$lotId] = BcMath::sub($boundedPool, $take);
                        $need = BcMath::sub($need, $take);
                    }
                }

                // Consume unrestricted pools
                foreach ($lotFreePools as $lotId => $lot) {
                    if (! BcMath::isPositive($need)) {
                        break;
                    }
                    $unresPool = $lotUnrestrictedRemaining[$lotId] ?? '0';
                    if (! BcMath::isPositive($unresPool)) {
                        continue;
                    }
                    $take = BcMath::min($need, $unresPool);
                    if (BcMath::isPositive($take)) {
                        $lotUnrestrictedRemaining[$lotId] = BcMath::sub($unresPool, $take);
                        $need = BcMath::sub($need, $take);
                    }
                }

                $totalShortageFromMatching = BcMath::add($totalShortageFromMatching, $need);

                if ($includeRfLineBreakdown) {
                    $rfLine = $entry['rf_line'];
                    $contributingRfLines[] = [
                        'rf_id' => $rf->id,
                        'rf_reference' => $rf->rf_number,
                        'rf_line_id' => $rfLine->id,
                        'rf_material_version' => (int) ($rf->material_version ?? 1),
                        'requesting_unit_id' => $rf->requesting_unit_id,
                        'needed_at' => $rf->needed_at?->utc()->format('Y-m-d\TH:i:s.u\Z') ?? $observedFormatted,
                        'approved_quantity' => BcMath::format($entry['approved_qty'], $scale),
                        'issued_quantity' => BcMath::format($entry['issued_qty'], $scale),
                        'canceled_quantity' => BcMath::format($entry['canceled_qty'], $scale),
                        'active_reserved_quantity' => BcMath::format($entry['active_reserved_qty'], $scale),
                        'unreserved_outstanding_quantity' => BcMath::format($entry['unreserved_qty'], $scale),
                    ];
                }
            }

            $naiveShortage = BcMath::sub($totalUnreservedDemand, $eligibleAvail);
            if (BcMath::comp($naiveShortage, $totalShortageFromMatching) > 0) {
                $totalShortageFromMatching = $naiveShortage;
            }

            // Aggregate inbound sources for this variant
            $vInbound = $inboundByVariant[$vId] ?? [];
            usort($vInbound, fn (array $a, array $b): int => [
                $a['source_kind'],
                (string) ($a['source_reference'] ?? ''),
                $a['source_id'],
            ] <=> [
                $b['source_kind'],
                (string) ($b['source_reference'] ?? ''),
                $b['source_id'],
            ]);

            $openRepfQty = BcMath::str('0');
            $openPoQty = BcMath::str('0');
            $excludedInboundQty = BcMath::str('0');
            $formattedInboundSources = [];

            foreach ($vInbound as $idx => $src) {
                $qty = BcMath::str($src['open_quantity']);
                if ($src['coverage_state'] === 'counted') {
                    if ($src['source_kind'] === 'repf') {
                        $openRepfQty = BcMath::add($openRepfQty, $qty);
                    } else {
                        $openPoQty = BcMath::add($openPoQty, $qty);
                    }
                } else {
                    $excludedInboundQty = BcMath::add($excludedInboundQty, $qty);
                }

                if ($idx < 50) {
                    $formattedInboundSources[] = [
                        'source_kind' => $src['source_kind'],
                        'source_id' => $src['source_id'],
                        'source_reference' => $src['source_reference'],
                        'status' => $src['status'],
                        'open_quantity' => BcMath::format($qty, $scale),
                        'coverage_state' => $src['coverage_state'],
                        'exclusion_reason' => $src['exclusion_reason'],
                    ];
                }
            }

            $totalInboundCoverage = BcMath::add($openRepfQty, $openPoQty);

            $variantSummaries[$vId] = [
                'variant' => $variant,
                'scale' => $scale,
                'usable_stockroom_on_hand' => $usableOnHand,
                'eligible_usable_stockroom_on_hand' => $eligibleUnheldOnHand,
                'active_rf_reservations' => $activeRfRes,
                'eligible_available_to_allocate' => $eligibleAvail,
                'total_unreserved_approved_rf_demand' => $totalUnreservedDemand,
                'unreserved_approved_rf_shortage' => $totalShortageFromMatching,
                'open_repf_quantity' => $openRepfQty,
                'open_po_inbound_quantity' => $openPoQty,
                'total_open_inbound_coverage' => $totalInboundCoverage,
                'excluded_inbound_quantity' => $excludedInboundQty,
                'contributing_rf_lines' => $contributingRfLines,
                'inbound_sources' => $formattedInboundSources,
            ];
        }

        // Compute deterministic positive snapshot_version across chapter state
        $snapshotVersion = max(
            1,
            (int) $chapter->version
            + (int) $policies->sum('policy_version')
            + (int) $lots->sum('stock_version')
            + (int) $approvedRfLines->sum(fn ($l) => (int) ($l->rf?->version ?? 0))
            + (int) $activeResRows->sum('version')
        );

        // Build exact ReplenishmentNeedItem payloads for each requested variant
        $items = [];
        foreach ($variantIds as $vId) {
            $summary = $variantSummaries[$vId];
            $variant = $summary['variant'];
            $item = $variant->item;
            $unit = $variant->unit;
            $scale = (int) $summary['scale'];
            $threshold = $thresholdsByItem[(string) $variant->item_id];

            $approvedRopStr = $threshold['approved_rop'];
            $approvedTargetStr = $threshold['approved_target_level'];

            // Multi-variant item ROP/target aggregation across sibling variants sharing the variant's unit_id
            $itemUsableOnHand = BcMath::str('0');
            $itemEligibleOnHand = BcMath::str('0');
            $itemActiveRes = BcMath::str('0');
            $itemUnreservedDemand = BcMath::str('0');
            $itemTotalInbound = BcMath::str('0');
            $siblingCount = 0;

            foreach ($variantSummaries as $sib) {
                $sibVar = $sib['variant'];
                if ($sibVar->item_id === $variant->item_id && $sibVar->unit_id === $variant->unit_id) {
                    $siblingCount++;
                    $itemUsableOnHand = BcMath::add($itemUsableOnHand, $sib['usable_stockroom_on_hand']);
                    $itemEligibleOnHand = BcMath::add($itemEligibleOnHand, $sib['eligible_usable_stockroom_on_hand']);
                    $itemActiveRes = BcMath::add($itemActiveRes, $sib['active_rf_reservations']);
                    $itemUnreservedDemand = BcMath::add($itemUnreservedDemand, $sib['total_unreserved_approved_rf_demand']);
                    $itemTotalInbound = BcMath::add($itemTotalInbound, $sib['total_open_inbound_coverage']);
                }
            }

            $lowStockBreach = $approvedRopStr !== null
                && BcMath::comp($itemUsableOnHand, $approvedRopStr) <= 0;

            $grossRfShortageNeed = $summary['unreserved_approved_rf_shortage'];

            $grossRopNeed = BcMath::str('0');
            if ($lowStockBreach && $approvedTargetStr !== null) {
                $netPostRfPosition = BcMath::sub(
                    $itemEligibleOnHand,
                    BcMath::add($itemActiveRes, $itemUnreservedDemand)
                );
                $positivePostRf = BcMath::comp($netPostRfPosition, '0') > 0 ? $netPostRfPosition : BcMath::str('0');
                $topUp = BcMath::sub($approvedTargetStr, $positivePostRf);
                if (BcMath::isPositive($topUp)) {
                    $grossRopNeed = $topUp;
                }
            }

            $grossCombinedNeed = BcMath::add($grossRfShortageNeed, $grossRopNeed);

            $effectiveInboundForVariant = $siblingCount > 1
                ? $itemTotalInbound
                : $summary['total_open_inbound_coverage'];

            $uncoveredRfShortage = BcMath::sub($grossRfShortageNeed, $effectiveInboundForVariant);
            if (BcMath::comp($uncoveredRfShortage, '0') < 0) {
                $uncoveredRfShortage = BcMath::str('0');
            }

            $inboundLeftAfterRf = BcMath::sub($effectiveInboundForVariant, $grossRfShortageNeed);
            if (BcMath::comp($inboundLeftAfterRf, '0') < 0) {
                $inboundLeftAfterRf = BcMath::str('0');
            }

            $uncoveredRopNeed = BcMath::sub($grossRopNeed, $inboundLeftAfterRf);
            if (BcMath::comp($uncoveredRopNeed, '0') < 0) {
                $uncoveredRopNeed = BcMath::str('0');
            }

            $proposedUncovered = BcMath::add($uncoveredRfShortage, $uncoveredRopNeed);

            $displayName = (string) ($variant->label ?: $variant->name ?: $item?->name ?: $variant->code);

            $items[] = [
                'chapter_id' => $chapterId,
                'item_id' => (string) $variant->item_id,
                'item_code' => (string) ($item?->code ?? ''),
                'variant_id' => $vId,
                'variant_code' => (string) ($variant->code ?? $variant->sku ?? ''),
                'display_name' => $displayName,
                'unit_id' => (string) $variant->unit_id,
                'unit_code' => (string) ($unit?->code ?? ''),
                'quantity_scale' => $scale,
                'approved_rop' => $approvedRopStr !== null ? BcMath::format($approvedRopStr, $scale) : null,
                'rop_policy' => $threshold['rop_policy'],
                'approved_target_level' => $approvedTargetStr !== null ? BcMath::format($approvedTargetStr, $scale) : null,
                'target_level_policy' => $threshold['target_level_policy'],
                'usable_stockroom_on_hand' => BcMath::format($summary['usable_stockroom_on_hand'], $scale),
                'eligible_usable_stockroom_on_hand' => BcMath::format($summary['eligible_usable_stockroom_on_hand'], $scale),
                'active_rf_reservations' => BcMath::format($summary['active_rf_reservations'], $scale),
                'eligible_available_to_allocate' => BcMath::format($summary['eligible_available_to_allocate'], $scale),
                'total_unreserved_approved_rf_demand' => BcMath::format($summary['total_unreserved_approved_rf_demand'], $scale),
                'unreserved_approved_rf_shortage' => BcMath::format($summary['unreserved_approved_rf_shortage'], $scale),
                'open_repf_quantity' => BcMath::format($summary['open_repf_quantity'], $scale),
                'open_po_inbound_quantity' => BcMath::format($summary['open_po_inbound_quantity'], $scale),
                'total_open_inbound_coverage' => BcMath::format($summary['total_open_inbound_coverage'], $scale),
                'excluded_inbound_quantity' => BcMath::format($summary['excluded_inbound_quantity'], $scale),
                'low_stock_breach' => $lowStockBreach,
                'gross_rf_shortage_need' => BcMath::format($grossRfShortageNeed, $scale),
                'gross_rop_replenishment_need' => BcMath::format($grossRopNeed, $scale),
                'gross_combined_need' => BcMath::format($grossCombinedNeed, $scale),
                'uncovered_rf_shortage_quantity' => BcMath::format($uncoveredRfShortage, $scale),
                'uncovered_rop_replenishment_quantity' => BcMath::format($uncoveredRopNeed, $scale),
                'proposed_uncovered_quantity' => BcMath::format($proposedUncovered, $scale),
                'contributing_rf_lines' => $summary['contributing_rf_lines'],
                'inbound_sources' => $summary['inbound_sources'],
                'setup_blockers' => $threshold['blockers'],
                'observed_at' => $observedFormatted,
            ];
        }

        // Preserve input order or deterministic ordering (callers like Stage2InventoryQueryController pass sorted IDs)
        return [
            'outcome' => 'ready',
            'snapshot_version' => $snapshotVersion,
            'observed_at' => $observedFormatted,
            'items' => $items,
        ];
    }
}
