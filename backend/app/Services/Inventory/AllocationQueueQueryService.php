<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Exceptions\ContractException;
use App\Models\CatalogueVariant;
use App\Models\InternalRfLine;
use App\Models\InventoryLot;
use App\Services\Authority\ChapterAuthority;
use App\Services\Shared\BcMath;
use Carbon\CarbonImmutable;

/**
 * Computes the read-only INV-09 ordered Allocation Queue (`GET /allocation-queue`)
 * with ADR 0004 lot restriction segregation and Stage 1 deep-link next routes.
 */
final class AllocationQueueQueryService
{
    public function __construct(
        private readonly StockEligibilityEvaluator $eligibilityEvaluator,
        private readonly InventoryPolicyResolver $policyResolver,
    ) {}

    /**
     * @param  array{
     *   item_id?: string|null,
     *   variant_id?: string|null,
     *   rf_id?: string|null,
     *   requesting_unit_id?: string|null,
     *   eligible_only: bool
     * }  $filters
     * @return array{
     *   allocation_policy: array{policy_id: string, version: int},
     *   observed_at: string,
     *   snapshot_version: positive-int,
     *   entries: list<array<string, mixed>>
     * }
     */
    public function buildQueue(ChapterAuthority $authority, array $filters): array
    {
        $chapterId = $authority->chapter->id;
        $observedAt = CarbonImmutable::now('UTC');
        $observedStr = $observedAt->format('Y-m-d\TH:i:s.u\Z');

        $policies = $this->policyResolver->lockChapterPolicies($authority, [
            'allocation_priority',
            'quantity_scale',
        ]);
        $allocPolicy = $this->policyResolver->requireAllocationPriority($authority, $policies, $observedAt);

        $lineQuery = InternalRfLine::query()
            ->whereHas('rf', function ($q) use ($chapterId, $filters) {
                $q->where('chapter_id', $chapterId)
                    ->where('status', 'approved');
                if (! empty($filters['rf_id'])) {
                    $q->where('id', $filters['rf_id']);
                }
                if (! empty($filters['requesting_unit_id'])) {
                    $q->where('requesting_unit_id', $filters['requesting_unit_id']);
                }
            })
            ->with(['rf', 'reservations' => fn ($q) => $q->where('status', 'ACTIVE')])
            ->orderBy('id')
            ->sharedLock();

        if (! empty($filters['variant_id'])) {
            $lineQuery->where('variant_id', $filters['variant_id']);
        }

        $rfLines = $lineQuery->get();

        // Load variants cleanly so we can filter by item_id and resolve scales/labels
        $variantIds = $rfLines->pluck('variant_id')->unique()->values()->all();
        $variants = $variantIds !== []
            ? CatalogueVariant::where('chapter_id', $chapterId)
                ->whereIn('id', $variantIds)
                ->with(['item', 'unit'])
                ->sharedLock()
                ->get()
                ->keyBy('id')
            : collect();

        $candidateLines = [];
        $activeVariantIds = [];
        foreach ($rfLines as $rfLine) {
            $rf = $rfLine->rf;
            $variant = $variants->get($rfLine->variant_id);
            if (! $rf || ! $variant) {
                continue;
            }
            if (! empty($filters['item_id']) && $variant->item_id !== $filters['item_id']) {
                continue;
            }

            $approvedQty = BcMath::str($rfLine->approved_quantity ?? '0');
            $issuedQty = BcMath::str($rfLine->issued_quantity ?? '0');
            $canceledQty = BcMath::str($rfLine->canceled_quantity ?? '0');
            $activeReserved = BcMath::str('0');
            foreach ($rfLine->reservations as $res) {
                $activeReserved = BcMath::add($activeReserved, BcMath::str($res->active_quantity ?? $res->quantity));
            }

            $unreservedOutstanding = BcMath::sub(
                $approvedQty,
                BcMath::add($issuedQty, BcMath::add($canceledQty, $activeReserved))
            );
            if (! BcMath::isPositive($unreservedOutstanding)) {
                continue;
            }

            $qs = $this->policyResolver->resolveQuantityScale($authority, $policies, $variant->id);
            if (! $qs['effective']) {
                throw new ContractException(
                    409,
                    'setup_blocked',
                    'Required quantity_scale policy is not effective for queued variant.',
                    ['blockers' => [$qs['blocker']]]
                );
            }

            $activeVariantIds[$variant->id] = true;
            $candidateLines[] = [
                'rf' => $rf,
                'rf_line' => $rfLine,
                'variant' => $variant,
                'scale' => (int) $qs['scale'],
                'approved_qty' => $approvedQty,
                'issued_qty' => $issuedQty,
                'canceled_qty' => $canceledQty,
                'active_reserved_qty' => $activeReserved,
                'unreserved_outstanding' => $unreservedOutstanding,
            ];
        }

        // Load all chapter lots for queued variants
        $queuedVariantIdList = array_keys($activeVariantIds);
        $lots = $queuedVariantIdList !== []
            ? InventoryLot::where('chapter_id', $chapterId)
                ->whereIn('variant_id', $queuedVariantIdList)
                ->orderBy('created_at')
                ->orderBy('id')
                ->sharedLock()
                ->get()
            : collect();
        $preloaded = $this->eligibilityEvaluator->preloadLots($chapterId, $lots);
        $lotsByVariant = $lots->groupBy('variant_id');

        $entries = [];
        foreach ($candidateLines as $item) {
            $rf = $item['rf'];
            $rfLine = $item['rf_line'];
            $variant = $item['variant'];
            $scale = $item['scale'];

            $isActiveCommitment = BcMath::isPositive($item['active_reserved_qty']);
            $override = $allocPolicy['active_overrides'][$rfLine->id] ?? null;
            if ($isActiveCommitment) {
                $tier = 'active_commitment';
                $tierOrder = 1;
                $overridePolicyId = null;
            } elseif ($override !== null && ($override['rf_id'] === '' || $override['rf_id'] === $rf->id)) {
                $tier = 'approved_override';
                $tierOrder = 2;
                $overridePolicyId = $override['override_policy_id'];
            } else {
                $tier = 'standard_priority';
                $tierOrder = 3;
                $overridePolicyId = null;
            }

            $priorityRank = max(1, min(1000, (int) ($allocPolicy['unit_ranks'][$rf->requesting_unit_id] ?? 1000)));
            $neededAt = $rf->needed_at?->utc()->format('Y-m-d\TH:i:s.u\Z') ?? $observedStr;
            $approvedAt = $rf->approved_at?->utc()->format('Y-m-d\TH:i:s.u\Z') ?? $observedStr;

            $usableOnHand = BcMath::str('0');
            $activeHoldQty = BcMath::str('0');
            $ineligibleRestricted = BcMath::str('0');
            $uninterpretedRestricted = BcMath::str('0');
            $eligibleAvailQty = BcMath::str('0');
            $eligibleSources = [];

            foreach ($lotsByVariant->get($variant->id, collect()) as $lot) {
                $eval = $this->eligibilityEvaluator->evaluateLot($lot, $rf, $observedAt, $preloaded);
                if (! $eval['is_usable_stockroom']) {
                    continue;
                }
                $usableOnHand = BcMath::add($usableOnHand, $eval['usable_stockroom_on_hand']);
                $activeHoldQty = BcMath::add($activeHoldQty, $eval['active_stock_hold_quantity']);
                $ineligibleRestricted = BcMath::add($ineligibleRestricted, $eval['ineligible_restricted_quantity']);
                $uninterpretedRestricted = BcMath::add($uninterpretedRestricted, $eval['uninterpreted_restricted_quantity']);
                $eligibleAvailQty = BcMath::add($eligibleAvailQty, $eval['eligible_free_quantity']);

                if (BcMath::isPositive($eval['eligible_free_quantity'])) {
                    $eligibleSources[] = [
                        'stock_lot_id' => $eval['stock_lot_id'],
                        'source_kind' => $eval['source_kind'],
                        'source_reference' => $eval['source_reference'],
                        'location_id' => $eval['location_id'],
                        'free_quantity' => BcMath::format($eval['eligible_free_quantity'], $scale),
                        'restriction_state' => $eval['restriction_state'] === 'bounded' ? 'bounded' : 'unrestricted',
                    ];
                }
            }

            if ($filters['eligible_only'] && ! BcMath::isPositive($eligibleAvailQty)) {
                continue;
            }

            usort($eligibleSources, fn (array $a, array $b): int => [
                $a['restriction_state'] === 'unrestricted' ? 0 : 1,
                $a['stock_lot_id'],
            ] <=> [
                $b['restriction_state'] === 'unrestricted' ? 0 : 1,
                $b['stock_lot_id'],
            ]);

            $fulfillment = BcMath::isPositive($item['issued_qty']) ? 'partially_issued' : 'outstanding';

            $entries[] = [
                '_sort' => [$tierOrder, $priorityRank, $neededAt, $approvedAt, $rfLine->id],
                'payload' => [
                    'queue_position' => 1,
                    'allocation_tier' => $tier,
                    'priority_rank' => $priorityRank,
                    'override_policy_id' => $overridePolicyId,
                    'needed_at' => $neededAt,
                    'approved_at' => $approvedAt,
                    'rf_id' => $rf->id,
                    'rf_reference' => $rf->rf_number,
                    'rf_line_id' => $rfLine->id,
                    'rf_version' => (int) ($rf->version ?? 1),
                    'rf_material_version' => (int) ($rf->material_version ?? 1),
                    'rf_progress_version' => (int) ($rf->progress_version ?? 1),
                    'rf_fulfillment' => $fulfillment,
                    'requesting_unit_id' => $rf->requesting_unit_id,
                    'event_id' => $rf->event_id,
                    'item_id' => (string) $variant->item_id,
                    'item_code' => (string) ($variant->item?->code ?? ''),
                    'item_name' => (string) ($variant->item?->name ?? $variant->item?->code ?? ''),
                    'variant_id' => $variant->id,
                    'variant_code' => (string) ($variant->code ?? $variant->sku ?? ''),
                    'variant_label' => (string) ($variant->label ?: $variant->name ?: $variant->code),
                    'unit_id' => (string) $variant->unit_id,
                    'unit_code' => (string) ($variant->unit?->code ?? ''),
                    'quantity_scale' => $scale,
                    'approved_quantity' => BcMath::format($item['approved_qty'], $scale),
                    'issued_quantity' => BcMath::format($item['issued_qty'], $scale),
                    'canceled_quantity' => BcMath::format($item['canceled_qty'], $scale),
                    'active_reserved_quantity' => BcMath::format($item['active_reserved_qty'], $scale),
                    'unreserved_outstanding_quantity' => BcMath::format($item['unreserved_outstanding'], $scale),
                    'usable_stockroom_on_hand' => BcMath::format($usableOnHand, $scale),
                    'active_stock_hold_quantity' => BcMath::format($activeHoldQty, $scale),
                    'ineligible_restricted_quantity' => BcMath::format($ineligibleRestricted, $scale),
                    'uninterpreted_restricted_quantity' => BcMath::format($uninterpretedRestricted, $scale),
                    'eligible_available_quantity' => BcMath::format($eligibleAvailQty, $scale),
                    'eligible_sources' => array_slice($eligibleSources, 0, 50),
                    'stage1_next_routes' => [
                        'allocation_review_route' => "/api/v1/chapters/{$chapterId}/internal-rfs/{$rf->id}/allocation-review?rf_line_id={$rfLine->id}",
                        'reservation_prepare_route' => "/api/v1/chapters/{$chapterId}/internal-rfs/{$rf->id}/reservation-preparations",
                        'actual_issue_prepare_route' => "/api/v1/chapters/{$chapterId}/internal-rfs/{$rf->id}/actual-issues",
                    ],
                ],
            ];
        }

        usort($entries, fn (array $a, array $b): int => $a['_sort'] <=> $b['_sort']);

        $formatted = [];
        foreach ($entries as $index => $row) {
            $payload = $row['payload'];
            $payload['queue_position'] = $index + 1;
            $formatted[] = $payload;
        }

        $snapshotVersion = max(
            1,
            (int) $authority->chapter->version
            + (int) $policies->sum('policy_version')
            + (int) $lots->sum('stock_version')
            + (int) $rfLines->sum(fn ($l) => (int) ($l->rf?->version ?? 0))
        );

        return [
            'allocation_policy' => $allocPolicy['policy_ref'],
            'observed_at' => $observedStr,
            'snapshot_version' => $snapshotVersion,
            'entries' => $formatted,
        ];
    }
}
