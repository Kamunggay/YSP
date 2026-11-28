<?php

declare(strict_types=1);

namespace App\Services\Inventory\Participants;

use App\Services\Shared\BcMath;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Reads live open procurement supply from Stage 2 RepFs and Purchase Orders
 * when Stage 2 tables are present in the schema.
 */
final class DatabaseOpenProcurementSupplyProvider implements OpenProcurementSupplyProvider
{
    private const OPEN_REPF_STATUSES = [
        'pending_budget_review',
        'held',
        'approved',
        'partially_ordered',
    ];

    private const OPEN_PO_STATUSES = [
        'issued',
        'partially_received',
    ];

    public function getInboundSourcesForVariants(
        string $chapterId,
        array $variantIds,
        ?string $excludeRepfId = null,
        ?string $observedAt = null
    ): array {
        if ($variantIds === []) {
            return [];
        }

        $observedMoment = $observedAt
            ? CarbonImmutable::parse($observedAt)->utc()
            : CarbonImmutable::now('UTC');
        $observedDate = $observedMoment->toDateString();

        $sources = [];

        if (Schema::hasTable('repfs') && Schema::hasTable('repf_lines')) {
            $repfRows = DB::table('repf_lines')
                ->join('repfs', 'repfs.id', '=', 'repf_lines.repf_id')
                ->where('repfs.chapter_id', $chapterId)
                ->whereIn('repfs.status', self::OPEN_REPF_STATUSES)
                ->whereIn('repf_lines.variant_id', $variantIds)
                ->when($excludeRepfId !== null, fn ($q) => $q->where('repfs.id', '!=', $excludeRepfId))
                ->whereRaw('repf_lines.remaining_to_order_quantity > 0')
                ->select([
                    'repfs.id as source_id',
                    'repfs.repf_reference as source_reference',
                    'repfs.status as status',
                    'repfs.linked_demand_canceled as header_demand_canceled',
                    'repf_lines.variant_id as variant_id',
                    'repf_lines.unit_id as unit_id',
                    'repf_lines.remaining_to_order_quantity as open_quantity',
                    'repf_lines.linked_demand_canceled as line_demand_canceled',
                    'repf_lines.needed_by as needed_by',
                ])
                ->sharedLock()
                ->get();

            foreach ($repfRows as $row) {
                $qty = BcMath::str((string) $row->open_quantity);
                if (! BcMath::isPositive($qty)) {
                    continue;
                }

                $coverageState = 'counted';
                $reason = null;

                if ($row->header_demand_canceled || $row->line_demand_canceled) {
                    $coverageState = 'ineligible';
                    $reason = 'Linked internal RF demand was canceled.';
                } elseif ($row->status === 'held') {
                    $coverageState = 'disputed';
                    $reason = 'Requisition is held pending budget review clarification.';
                } elseif ($row->needed_by !== null && (string) $row->needed_by < $observedDate) {
                    $coverageState = 'late';
                    $reason = 'Expected replenishment date has already passed.';
                }

                $key = "repf|{$row->variant_id}|{$row->source_id}";
                if (! isset($sources[$key])) {
                    $sources[$key] = [
                        'variant_id' => (string) $row->variant_id,
                        'unit_id' => (string) $row->unit_id,
                        'source_kind' => 'repf',
                        'source_id' => (string) $row->source_id,
                        'source_reference' => $row->source_reference !== null ? (string) $row->source_reference : null,
                        'status' => (string) $row->status,
                        'open_quantity' => $qty,
                        'coverage_state' => $coverageState,
                        'exclusion_reason' => $reason,
                    ];
                } else {
                    $sources[$key]['open_quantity'] = BcMath::add($sources[$key]['open_quantity'], $qty);
                    if ($sources[$key]['coverage_state'] === 'counted' && $coverageState !== 'counted') {
                        $sources[$key]['coverage_state'] = $coverageState;
                        $sources[$key]['exclusion_reason'] = $reason;
                    }
                }
            }
        }

        if (Schema::hasTable('purchase_orders') && Schema::hasTable('purchase_order_lines')) {
            $poRows = DB::table('purchase_order_lines')
                ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_lines.po_id')
                ->where('purchase_orders.chapter_id', $chapterId)
                ->whereIn('purchase_orders.status', self::OPEN_PO_STATUSES)
                ->whereIn('purchase_order_lines.variant_id', $variantIds)
                ->whereRaw('purchase_order_lines.outstanding_quantity > 0')
                ->select([
                    'purchase_orders.id as source_id',
                    'purchase_orders.po_reference as source_reference',
                    'purchase_orders.status as status',
                    'purchase_orders.expected_delivery_date as expected_delivery_date',
                    'purchase_orders.revised_expected_delivery_date as revised_expected_delivery_date',
                    'purchase_orders.linked_demand_canceled as header_demand_canceled',
                    'purchase_order_lines.id as po_line_id',
                    'purchase_order_lines.variant_id as variant_id',
                    'purchase_order_lines.unit_id as unit_id',
                    'purchase_order_lines.outstanding_quantity as open_quantity',
                    'purchase_order_lines.linked_demand_canceled as line_demand_canceled',
                ])
                ->sharedLock()
                ->get();

            $disputedPoLineIds = [];
            if ($poRows->isNotEmpty() && Schema::hasTable('receiving_discrepancies')) {
                $disputedPoLineIds = DB::table('receiving_discrepancies')
                    ->where('chapter_id', $chapterId)
                    ->where('source_kind', 'po')
                    ->where('status', 'open')
                    ->whereIn('source_line_id', $poRows->pluck('po_line_id')->all())
                    ->pluck('source_line_id')
                    ->flip()
                    ->all();
            }

            foreach ($poRows as $row) {
                $qty = BcMath::str((string) $row->open_quantity);
                if (! BcMath::isPositive($qty)) {
                    continue;
                }

                $effectiveEta = $row->revised_expected_delivery_date ?? $row->expected_delivery_date;
                $coverageState = 'counted';
                $reason = null;

                if ($row->header_demand_canceled || $row->line_demand_canceled) {
                    $coverageState = 'ineligible';
                    $reason = 'Linked internal RF demand was canceled.';
                } elseif (isset($disputedPoLineIds[(string) $row->po_line_id])) {
                    $coverageState = 'disputed';
                    $reason = 'Open receiving discrepancy on this purchase order line.';
                } elseif ($effectiveEta !== null && (string) $effectiveEta < $observedDate) {
                    $coverageState = 'late';
                    $reason = 'Expected supplier delivery date has passed.';
                }

                $key = "po|{$row->variant_id}|{$row->source_id}";
                if (! isset($sources[$key])) {
                    $sources[$key] = [
                        'variant_id' => (string) $row->variant_id,
                        'unit_id' => (string) $row->unit_id,
                        'source_kind' => 'po',
                        'source_id' => (string) $row->source_id,
                        'source_reference' => $row->source_reference !== null ? (string) $row->source_reference : null,
                        'status' => (string) $row->status,
                        'open_quantity' => $qty,
                        'coverage_state' => $coverageState,
                        'exclusion_reason' => $reason,
                    ];
                } else {
                    $sources[$key]['open_quantity'] = BcMath::add($sources[$key]['open_quantity'], $qty);
                    if ($sources[$key]['coverage_state'] === 'counted' && $coverageState !== 'counted') {
                        $sources[$key]['coverage_state'] = $coverageState;
                        $sources[$key]['exclusion_reason'] = $reason;
                    }
                }
            }
        }

        return array_values($sources);
    }
}
