<?php

namespace App\Services\Inventory;

use App\Models\ActualIssueLine;
use App\Models\CatalogueLocation;
use App\Models\CatalogueVariant;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\PolicyRecord;
use App\Models\PurchaseOrderLine;
use App\Models\RfReservationAllocation;
use App\Models\StockHoldRange;
use App\Services\Authority\ChapterAuthority;
use App\Services\Shared\BcMath;
use App\Services\Shared\Stage2ReportRecords as Records;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

final class InventoryReport
{
    public const LABELS = [
        'usable_stockroom_on_hand' => 'Usable stockroom on-hand',
        'available_to_allocate' => 'Available-to-allocate',
        'rf_reserved' => 'RF-reserved',
        'so_reserved' => 'SO-reserved',
        'booth_custody' => 'Booth custody',
        'quarantined_rejected' => 'Quarantined/rejected',
        'inbound_open_po' => 'Inbound open PO',
        'views_are_additive' => false,
    ];

    public function build(string $chapterId, array $filters, CarbonImmutable $now): array
    {
        $variants = Records::variants($chapterId, $filters)->with(['item', 'unit'])->orderBy('id')->get()->keyBy('id');
        $locations = CatalogueLocation::where('chapter_id', $chapterId)->orderBy('id')->get()->keyBy('id');
        $thresholds = $this->thresholds($chapterId, $now, $variants);
        $lots = InventoryLot::where('chapter_id', $chapterId)->whereIn('variant_id', $variants->keys())
            ->with('custodian')->orderBy('id')->get();
        $holds = StockHoldRange::where('chapter_id', $chapterId)
            ->whereHas('hold', fn (Builder $query) => $query->where('status', 'active'))
            ->get()->groupBy('lot_id');
        $reservations = RfReservationAllocation::where('chapter_id', $chapterId)->where('status', 'active')
            ->whereHas('reservation', fn (Builder $query) => $query->where('status', 'ACTIVE'))
            ->get()->groupBy('lot_id');
        $movements = InventoryMovement::where('chapter_id', $chapterId)->whereIn('variant_id', $variants->keys())
            ->orderBy('created_at')->orderBy('id')->get()->groupBy('lot_id');
        $issues = ActualIssueLine::whereIn('lot_id', $lots->modelKeys())
            ->whereHas('actualIssue', fn (Builder $query) => Records::period($query->where('chapter_id', $chapterId)
                ->where('status', 'posted'), 'posted_at', $filters))->get()->groupBy('lot_id');
        $receivingLocations = Records::receiptLocations($chapterId, 'po');
        $commitments = PurchaseOrderLine::whereIn('variant_id', $variants->keys())->where('outstanding_quantity', '>', 0)
            ->whereHas('purchaseOrder', fn (Builder $query) => $query->where('chapter_id', $chapterId)->whereIn('status', Records::OPEN_PO))
            ->with('purchaseOrder')->orderBy('id')->get()->groupBy('variant_id');
        $demand = Records::rfLines($chapterId)->get()->groupBy('variant_id');
        $breaches = $this->breaches($lots, $thresholds);
        $rows = [];

        foreach ($lots as $lot) {
            $location = $locations->get($lot->location_id);
            if ($location === null || ($filters['location_id'] && $location->id !== $filters['location_id'])) {
                continue;
            }
            $variant = $variants->get($lot->variant_id);
            $condition = match (strtolower($lot->condition)) {
                'quarantine', 'quarantined' => 'quarantined',
                'rejected' => 'rejected',
                default => 'usable',
            };
            $custody = strtolower($lot->custody);
            $restriction = $lot->restriction_state ?? 'unrestricted';
            $holdRanges = $holds->get($lot->id, collect())->map(fn ($range) => [
                'offset' => $range->offset_quantity, 'quantity' => $range->quantity,
            ])->all();
            $reservedRanges = $reservations->get($lot->id, collect())->map(fn ($range) => [
                'offset' => $range->offset_quantity,
                'quantity' => BcMath::max('0', BcMath::sub(BcMath::sub($range->quantity, $range->consumed_quantity), $range->released_quantity)),
            ])->all();
            $held = BcMath::intervalUnionLength($holdRanges);
            $usable = $condition === 'usable' && $custody === 'stockroom';
            $eligibility = match (true) {
                $condition !== 'usable' => 'quarantined_or_rejected',
                BcMath::isPositive($held) => 'held',
                $restriction === 'uninterpreted' => 'blocked_uninterpreted',
                $restriction === 'bounded' => 'restricted_bounded',
                default => 'eligible',
            };
            $key = implode('|', [$variant->id, $location->id, $lot->custodian_user_id, $condition, $custody, $restriction, $eligibility]);
            $rows[$key] ??= $this->row($variant, $location, $thresholds, $breaches, $condition, $custody, $restriction, $eligibility,
                $lot->custodian_user_id, $lot->custodian?->name);
            $lotMovements = $movements->get($lot->id, collect());
            $amounts = [
                'usable_stockroom_on_hand' => $usable ? $lot->quantity_on_hand : '0',
                'available_to_allocate' => $usable && $restriction !== 'uninterpreted' && $lot->immediately_allocatable !== false
                    ? BcMath::max('0', BcMath::sub($lot->quantity_on_hand, BcMath::intervalUnionLength([...$holdRanges, ...$reservedRanges])))
                    : '0',
                'rf_reserved' => BcMath::intervalUnionLength($reservedRanges),
                'quarantined_rejected' => $condition === 'usable' ? '0' : $lot->quantity_on_hand,
                'active_stock_hold' => $held,
                'period_issues_quantity' => Records::sum($issues->get($lot->id, collect()), 'issued_quantity', 6),
                'usable_valuation_php' => $usable ? $this->valuation($lot, $lotMovements) : '0',
            ];
            foreach ($lotMovements as $movement) {
                if (! $this->withinPeriod($movement->created_at, $filters)) {
                    continue;
                }
                if (in_array($movement->movement_kind, ['accepted_receipt', 'opening_accepted_receipt'], true)) {
                    $amounts['period_receipts_quantity'] = BcMath::add($amounts['period_receipts_quantity'] ?? '0', $movement->quantity);

                }
            }
            foreach ($amounts as $field => $amount) {
                $rows[$key][$field] = BcMath::add($rows[$key][$field], $amount);
            }
        }

        $defaultLocation = $locations->first(fn ($location) => $location->kind === 'stockroom' && $location->state === 'active');
        foreach ($variants as $variant) {
            $variantRows = collect($rows)->where('variant_id', $variant->id);
            $location = $defaultLocation;
            $variantDemand = $demand->get($variant->id, collect());
            $shortage = $filters['location_id'] === null ? $variantDemand->reduce(
                fn (string $total, $line) => BcMath::add($total, Records::shortage($line)), '0'
            ) : '0';
            if ($location && ($filters['location_id'] === null || $filters['location_id'] === $location->id)
                && (isset($breaches[$variant->id]) || BcMath::isPositive($shortage))) {
                $key = $variantRows->firstWhere('restriction_state', 'unrestricted');
                $rowKey = $key === null ? "$variant->id|$location->id|demand" : $variantRows->search($key);
                $rows[$rowKey] ??= $this->row($variant, $location, $thresholds, $breaches);
                $rows[$rowKey]['unreserved_rf_shortage'] = $shortage;
            }
            foreach ($commitments->get($variant->id, collect()) as $line) {
                $po = $line->purchaseOrder;
                $location = $locations->get($receivingLocations->get($po->id)?->first())
                    ?? Records::deliveryLocation($po->delivery_location, $locations)
                    ?? ($filters['location_id'] === null ? $defaultLocation : null);
                if ($location === null || ($filters['location_id'] !== null && $filters['location_id'] !== $location->id)) {
                    continue;
                }
                $key = "$variant->id|$location->id|inbound";
                $rows[$key] ??= $this->row($variant, $location, $thresholds, $breaches, custody: 'inbound');
                $rows[$key]['inbound_open_po'] = BcMath::add($rows[$key]['inbound_open_po'], $line->outstanding_quantity);
            }
        }

        $rows = collect($rows)->sortKeys()->filter(fn (array $row) => $this->matchesStatus($row, $filters['status']))->values()
            ->map(function (array $row) {
                foreach (array_keys(self::QUANTITIES) as $field) {
                    $row[$field] = BcMath::format($row[$field], $row['quantity_scale']);
                }
                $row['usable_valuation_php'] = BcMath::format($row['usable_valuation_php'], 2);

                return $row;
            });

        return [['data' => $rows->all()], [
            'row_count' => $rows->count(),
            'total_usable_valuation_php' => Records::sum($rows, 'usable_valuation_php'),
            'low_stock_row_count' => $rows->where('low_stock_breach', true)->count(),
            'uninterpreted_row_count' => $rows->where('restriction_state', 'uninterpreted')->count(),
            'shortage_row_count' => $rows->filter(fn ($row) => BcMath::isPositive($row['unreserved_rf_shortage']))->count(),
        ], ['stock_category_labels' => self::LABELS]];
    }

    private const QUANTITIES = [
        'usable_stockroom_on_hand' => '0', 'available_to_allocate' => '0', 'rf_reserved' => '0',
        'quarantined_rejected' => '0', 'active_stock_hold' => '0', 'inbound_open_po' => '0',
        'period_receipts_quantity' => '0', 'period_issues_quantity' => '0', 'unreserved_rf_shortage' => '0',
    ];

    private function row(CatalogueVariant $variant, CatalogueLocation $location, array $thresholds, array $breaches,
        string $condition = 'usable', string $custody = 'stockroom', string $restriction = 'unrestricted',
        string $eligibility = 'eligible', ?string $custodianId = null, ?string $custodianName = null): array
    {
        $scale = $variant->quantity_scale;
        $rop = $thresholds[$variant->id]['rop']['quantity'] ?? null;
        $target = $thresholds[$variant->id]['target_level']['quantity'] ?? null;

        return [
            'item_id' => $variant->item_id, 'item_code' => $variant->item->code, 'item_name' => $variant->item->name,
            'variant_id' => $variant->id, 'variant_code' => $variant->code, 'variant_label' => $variant->label,
            'unit_id' => $variant->unit_id, 'unit_code' => $variant->unit->code, 'unit_label' => $variant->unit->name,
            'quantity_scale' => $scale, 'location_id' => $location->id, 'location_name' => $location->name,
            'custodian_id' => $custodianId, 'custodian_name' => $custodianName,
            'condition' => $condition, 'custody' => $custody, 'restriction_state' => $restriction, 'eligibility_status' => $eligibility,
            ...self::QUANTITIES,
            'approved_rop' => $rop === null ? null : BcMath::format($rop, $scale),
            'approved_target' => $target === null ? null : BcMath::format($target, $scale),
            'low_stock_breach' => isset($breaches[$variant->id]),
            'usable_valuation_php' => '0',
        ];
    }

    private function matchesStatus(array $row, string $status): bool
    {
        $shortage = BcMath::isPositive($row['unreserved_rf_shortage']);
        $quarantine = $row['condition'] !== 'usable';
        $uninterpreted = $row['restriction_state'] === 'uninterpreted';

        return match ($status) {
            'all' => true,
            'low_stock' => $row['low_stock_breach'],
            'with_shortage' => $shortage,
            'with_quarantine' => $quarantine,
            'with_uninterpreted_restriction' => $uninterpreted,
            'normal' => ! ($row['low_stock_breach'] || $shortage || $quarantine || $uninterpreted),
        };
    }

    private function withinPeriod(CarbonImmutable|Carbon $date, array $filters): bool
    {
        return $date >= Records::periodStart($filters['date_from']) && $date < Records::periodStart($filters['date_to'])->addDay();
    }

    private function valuation(InventoryLot $lot, Collection $movements): string
    {
        $receipt = $movements->first(fn ($movement) => in_array($movement->movement_kind, ['accepted_receipt', 'opening_accepted_receipt'], true));
        if ($receipt === null) {
            return '0.00';
        }
        if ($receipt->unit_valuation_php !== null) {
            return (string) BigDecimal::of($receipt->unit_valuation_php)->multipliedBy($lot->quantity_on_hand)->toScale(2, RoundingMode::HalfUp);
        }

        return (string) BigDecimal::of($receipt->accepted_value)->multipliedBy($lot->quantity_on_hand)
            ->dividedBy($receipt->quantity, 2, RoundingMode::HalfUp);
    }

    public function thresholds(string $chapterId, CarbonImmutable $now, Collection $variants): array
    {
        $itemThresholds = [];
        $policies = PolicyRecord::where('chapter_id', $chapterId)->whereIn('policy_code', ['rop', 'target_level'])
            ->where('effective_from', '<=', $now)->orderByDesc('effective_from')->orderByDesc('policy_version')->orderBy('id')->get();

        foreach ($policies as $policy) {
            $evidence = $policy->setupEvidence();
            $itemId = $evidence['subject_id'] ?? null;
            if ($itemId !== null
                && ChapterAuthority::policyState($policy, 'CHAPTER_HEAD', 'CatalogueThresholdPolicyValue', $itemId, $now, $evidence) === 'effective') {
                $itemThresholds[$itemId][$policy->policy_code] ??= $policy->rules_json + ['effective_from' => $policy->effective_from];
            }
        }

        return $variants->mapWithKeys(fn (CatalogueVariant $variant) => [$variant->id => array_filter(
            $itemThresholds[$variant->item_id] ?? [], fn (array $threshold) => $threshold['unit_id'] === $variant->unit_id,
        )])->filter()->all();
    }

    public function breaches(Collection $lots, array $thresholds): array
    {
        $usable = $lots->filter(fn (InventoryLot $lot) => strtolower($lot->condition) === 'usable'
            && strtolower($lot->custody) === 'stockroom' && $lot->restriction_state !== 'uninterpreted')->groupBy('variant_id');
        $breaches = [];
        foreach ($thresholds as $variantId => $threshold) {
            $rop = $threshold['rop']['quantity'] ?? null;
            $balance = Records::sum($usable->get($variantId, collect()), 'quantity_on_hand', 6);
            if ($rop !== null && BcMath::comp($balance, $rop) <= 0) {
                $breaches[$variantId] = $balance;
            }
        }

        return $breaches;
    }
}
