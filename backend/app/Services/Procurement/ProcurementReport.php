<?php

namespace App\Services\Procurement;

use App\Http\Resources\PurchaseOrderResource;
use App\Http\Resources\RepfResource;
use App\Models\CatalogueLocation;
use App\Models\PurchaseOrderLine;
use App\Models\ReceivingDiscrepancy;
use App\Models\Repf;
use App\Services\Shared\BcMath;
use App\Services\Shared\Stage2ReportRecords as Records;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

final class ProcurementReport
{
    public function build(string $chapterId, array $filters, CarbonImmutable $now): array
    {
        $variants = Records::variants($chapterId, $filters)->with('unit')->orderBy('id')->get()->keyBy('id');
        $locations = CatalogueLocation::where('chapter_id', $chapterId)->get()->keyBy('id');
        $receipts = Records::receipts($chapterId, 'po')->whereIn('variant_id', $variants->keys())
            ->orderBy('id')->get()->groupBy('source_line_id');
        $discrepancies = ReceivingDiscrepancy::where('chapter_id', $chapterId)->where('source_kind', 'po')
            ->whereIn('variant_id', $variants->keys())->get()->groupBy('source_line_id');
        $priority = collect(Records::policy($chapterId, 'allocation_priority', 'CHAPTER_HEAD', 'AllocationPriorityPolicyValue', $now)['priorities'] ?? [])
            ->pluck('rank', 'requesting_unit_id');
        $rfLocations = $filters['location_id'] === null ? null : Records::rfLinesAtLocation($chapterId, $filters['location_id']);

        $rfRows = Records::rfLines($chapterId, $filters)->get()
            ->filter(fn ($line) => $rfLocations === null || isset($rfLocations[$line->id]))
            ->map(function ($line) use ($variants, $priority) {
                $rf = $line->rf;
                $variant = $variants->get($line->variant_id);
                $scale = $line->identity_at_approval['quantity_scale'] ?? $variant->quantity_scale;
                $qty = fn (string $value) => BcMath::format($value, $scale);

                return [
                    'rf_id' => $rf->id, 'rf_reference' => $rf->rf_number, 'rf_line_id' => $line->id,
                    'requesting_unit_id' => $rf->requesting_unit_id, 'priority_rank' => $priority->get($rf->requesting_unit_id, 1000),
                    'needed_at' => RepfResource::instant($rf->needed_at), 'approved_at' => RepfResource::instant($rf->approved_at),
                    'rf_fulfillment' => $rf->fulfillment_status,
                    'item_id' => $variant->item_id, 'variant_id' => $variant->id, 'variant_code' => $variant->code,
                    'unit_id' => $line->unit_id, 'unit_code' => $variant->unit->code, 'quantity_scale' => $scale,
                    'approved_quantity' => $qty($line->approved_quantity), 'issued_quantity' => $qty($line->issued_quantity),
                    'outstanding_quantity' => $qty(Records::outstanding($line)), 'canceled_quantity' => $qty($line->canceled_quantity),
                    'active_reserved_quantity' => $qty($line->reserved_quantity),
                ];
            });

        $orderLines = PurchaseOrderLine::whereIn('variant_id', $variants->keys())
            ->whereHas('purchaseOrder', fn (Builder $query) => Records::period($query->where('chapter_id', $chapterId), 'created_at', $filters))
            ->with(['purchaseOrder', 'unit'])->orderBy('id')->get();
        $lineLocations = function (PurchaseOrderLine $line) use ($receipts, $locations): Collection {
            $receiving = $receipts->get($line->id, collect())->sortByDesc(fn ($receipt) => $receipt->receivingReport->posted_at)
                ->map(fn ($receipt) => $receipt->receivingReport->location_id);
            $destination = Records::deliveryLocation($line->purchaseOrder->delivery_location, $locations)?->id;

            return $receiving->push($destination)->filter()->unique()->values();
        };
        $locationId = $filters['location_id'];
        if ($locationId !== null) {
            $orderLines = $orderLines->filter(fn (PurchaseOrderLine $line) => $lineLocations($line)->contains($locationId));
        }
        $poRows = $orderLines->map(function (PurchaseOrderLine $line) use ($variants, $receipts, $discrepancies, $lineLocations, $locationId) {
            $order = $line->purchaseOrder;
            $row = PurchaseOrderResource::line($line);
            $lineReceipts = $receipts->get($line->id, collect());
            $exceptions = $discrepancies->get($line->id, collect());

            return [
                'po_id' => $order->id, 'po_line_id' => $line->id, 'po_reference' => $order->po_reference,
                'repf_id' => $order->repf_id, 'status' => $order->status, 'supplier_name' => $order->supplier['supplier_name'],
                'linked_demand_canceled' => $line->linked_demand_canceled,
                'variant_id' => $line->variant_id, 'variant_code' => $variants->get($line->variant_id)->code,
                'unit_id' => $line->unit_id, 'unit_code' => $line->unit->code, 'quantity_scale' => $line->quantity_scale,
                'location_id' => $locationId ?? $lineLocations($line)->first(), 'ordered_quantity' => $row['ordered_quantity'], 'accepted_quantity' => $row['accepted_quantity'],
                'rejected_or_disputed_quantity' => $row['rejected_or_disputed_quantity'], 'outstanding_quantity' => $row['outstanding_quantity'],
                'ordered_total_php' => $line->line_total_php, 'accepted_value_php' => Records::sum($lineReceipts, 'accepted_value_php'),
                'open_discrepancy_count' => $exceptions->whereIn('status', Records::OPEN_DISCREPANCY)->count(),
                'resolved_discrepancy_count' => $exceptions->where('status', 'resolved')->count(),
            ];
        });

        $locationRepfLines = $orderLines->pluck('repf_line_id')->flip();
        $repfs = Records::period(Repf::where('chapter_id', $chapterId), 'created_at', $filters)->with(['lines', 'quotations'])
            ->orderBy('id')->get()->map(function (Repf $repf) use ($variants, $locationRepfLines, $rfLocations) {
                $lines = $repf->lines->whereIn('variant_id', $variants->keys());
                if ($rfLocations !== null) {
                    $lines = $lines->filter(fn ($line) => isset($rfLocations[$line->rf_line_id]) || $locationRepfLines->has($line->id));
                }
                if ($lines->isEmpty()) {
                    return null;
                }

                return [
                    'repf_id' => $repf->id, 'repf_reference' => $repf->repf_reference, 'status' => $repf->status,
                    'trigger_kinds' => $lines->pluck('trigger_kind')->unique()->values()->all(), 'urgency' => $repf->urgency,
                    'linked_demand_canceled' => (bool) $repf->linked_demand_canceled,
                    'requested_total_php' => Records::sum($lines, 'estimated_line_total_php'),
                    'budget_decision' => $repf->review_json['budget_decision'] ?? null,
                    'budget_reviewed_at' => $repf->review_json['budget_reviewed_at'] ?? null,
                    'quotation_count' => $repf->quotations->count(),
                    'supplier_selected' => $repf->supplier_selection_json !== null,
                ];
            })->filter();

        $status = $filters['status'];
        $withDiscrepancy = $poRows->filter(fn ($row) => $row['open_discrepancy_count'] > 0);
        $rfRows = $this->filter($rfRows, $status, [
            'open_demand' => fn ($row) => BcMath::isPositive($row['outstanding_quantity']),
            'closed' => fn ($row) => ! BcMath::isPositive($row['outstanding_quantity']),
        ]);
        $repfs = $this->filter($repfs, $status, [
            'awaiting_approval' => fn ($row) => $row['status'] === 'pending_budget_review',
            'in_procurement' => fn ($row) => in_array($row['status'], ['approved', 'partially_ordered', 'ordered'], true),
            'with_discrepancy' => fn ($row) => $withDiscrepancy->contains('repf_id', $row['repf_id']),
            'demand_changed' => fn ($row) => $row['linked_demand_canceled'],
            'closed' => fn ($row) => in_array($row['status'], ['ordered', 'rejected', 'canceled'], true),
        ]);
        $poRows = $this->filter($poRows, $status, [
            'awaiting_approval' => fn ($row) => $row['status'] === 'pending_approval',
            'in_procurement' => fn ($row) => in_array($row['status'], Records::OPEN_PO, true),
            'partially_received' => fn ($row) => $row['status'] === 'partially_received',
            'with_discrepancy' => fn ($row) => $row['open_discrepancy_count'] > 0,
            'demand_changed' => fn ($row) => $row['linked_demand_canceled'],
            'closed' => fn ($row) => in_array($row['status'], ['receiving_complete', 'closed_short', 'rejected', 'canceled'], true),
        ]);

        return [[
            'rf_demand_summary' => $rfRows->all(), 'repf_summary' => $repfs->all(), 'purchase_order_summary' => $poRows->all(),
        ], [
            'open_rf_lines_count' => $rfRows->filter(fn ($row) => BcMath::isPositive($row['outstanding_quantity']))->count(),
            'repf_count' => $repfs->count(),
            'po_count' => $poRows->pluck('po_id')->unique()->count(),
            'total_ordered_php' => Records::sum($poRows, 'ordered_total_php'),
            'total_accepted_value_php' => Records::sum($poRows, 'accepted_value_php'),
            'open_discrepancy_count' => $poRows->sum('open_discrepancy_count'),
        ], []];
    }

    private function filter(Collection $rows, string $status, array $matches): Collection
    {
        return ($status === 'all' ? $rows : $rows->filter($matches[$status] ?? fn () => false))->values();
    }
}
