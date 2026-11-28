<?php

namespace App\Services\Inventory;

use App\Http\Resources\RepfResource;
use App\Models\Donation;
use App\Models\PurchaseOrder;
use App\Models\ReceivingDiscrepancy;
use App\Models\ReceivingHold;
use App\Models\Repf;
use App\Services\Authority\ChapterAuthority;
use App\Services\Shared\BcMath;
use App\Services\Shared\Stage2ReportRecords as Records;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

final class OfficerAlerts
{
    public const TYPES = [
        'low_stock_rop', 'repf_pending_approval', 'po_pending_approval', 'da_pending_acknowledgment',
        'demand_changed', 'open_receiving_discrepancy', 'active_missing_source_hold', 'open_rf_shortage',
    ];

    public function __construct(private InventoryReport $inventory) {}

    public function build(ChapterAuthority $authority, array $duties, array $filters, CarbonImmutable $now): array
    {
        $chapterId = $authority->chapter->id;
        $alerts = [];
        $add = function (string $type, string $severity, string $kind, array $responsible, string $route, string $summary, callable $rows) use ($authority, $chapterId, $duties, $filters, &$alerts): void {
            $eligible = array_values(array_intersect($responsible, $duties));
            if (isset($filters['responsible_duty'])) {
                $eligible = array_intersect($eligible, [$filters['responsible_duty']]);
            }
            if ($eligible === [] || ($filters['alert_type'] ?? $type) !== $type || ($filters['severity'] ?? $severity) !== $severity) {
                return;
            }

            foreach ($rows() as $row) {
                [$id, $reference, $detectedAt] = $row;
                $duty = collect($eligible)->first(fn (string $code) => $authority->allowsDuty($code, $row[3] ?? null));
                if ($duty === null) {
                    continue;
                }
                $path = str_replace('{id}', $id, $route);
                $alerts[] = [
                    'alert_key' => "$type:$kind:$id", 'alert_type' => $type, 'severity' => $severity,
                    'record_kind' => $kind, 'record_id' => $id, 'record_reference' => $reference,
                    'responsible_duty' => $duty, 'summary' => $summary,
                    'target_route_hint' => "/api/v1/chapters/$chapterId/$path",
                    'detected_at' => $detectedAt,
                ];
            }
        };

        $add('low_stock_rop', 'warning', 'variant', ['INVENTORY', 'PURCHASING'],
            'replenishment/needs?variant_id={id}', 'Usable stockroom balance is at or below the approved reorder point.',
            fn () => $this->lowStock($chapterId, $now));
        $approvers = ['BUDGET_APPROVER', 'CHAPTER_HEAD'];
        $repfs = Repf::where('chapter_id', $chapterId)->orderBy('id');
        $orders = PurchaseOrder::where('chapter_id', $chapterId)->orderBy('id');
        $add('repf_pending_approval', 'warning', 'repf', $approvers,
            'repfs/{id}', 'Replenishment request is awaiting independent budget review.',
            fn () => (clone $repfs)->where('status', 'pending_budget_review')->get()->map(fn ($row) => [
                $row->id, $row->repf_reference, $row->review_json['submitted_at'] ?? self::timestamp($row),
            ]));
        $add('po_pending_approval', 'warning', 'purchase_order', $approvers,
            'purchase-orders/{id}', 'Purchase Order is awaiting approval.',
            fn () => (clone $orders)->where('status', 'pending_approval')->get()->map(fn ($row) => [
                $row->id, $row->po_reference, $row->review_json['submitted_at'] ?? self::timestamp($row),
            ]));
        $daPolicy = Records::policy($chapterId, 'da_authorization', 'CHAPTER_HEAD', 'DaAuthorizationPolicyValue', $now);
        $add('da_pending_acknowledgment', 'info', 'donation', $daPolicy['acknowledge_duties'] ?? ['CHAPTER_HEAD', 'FINANCE', 'INVENTORY', 'RECEIVING'],
            'donations/{id}', 'Donation is awaiting signed acknowledgment.',
            fn () => Donation::where('chapter_id', $chapterId)->where('status', 'pending_acknowledgment')->orderBy('id')->get()
                ->map(fn ($row) => [$row->id, $row->reference, self::timestamp($row)]));

        $demandDuties = ['PURCHASING', ...$approvers];
        $add('demand_changed', 'critical', 'repf', $demandDuties,
            'repfs/{id}', 'Linked RF demand was canceled. Review the remaining replenishment request.',
            fn () => $repfs->where('linked_demand_canceled', true)
                ->whereNotIn('status', ['ordered', 'canceled', 'rejected'])->get()
                ->map(fn ($row) => [$row->id, $row->repf_reference, self::timestamp($row, $row->linked_demand_canceled_at)]));
        $add('demand_changed', 'critical', 'purchase_order', $demandDuties,
            'purchase-orders/{id}', 'Linked RF demand was canceled. Review the remaining Purchase Order.',
            fn () => $orders->where('linked_demand_canceled', true)
                ->whereIn('status', ['draft', 'returned_for_revision', 'pending_approval', ...Records::OPEN_PO])->get()
                ->map(fn ($row) => [$row->id, $row->po_reference, self::timestamp($row, $row->linked_demand_canceled_at)]));
        $add('open_receiving_discrepancy', 'critical', 'receiving_discrepancy', ['RECEIVING', 'PURCHASING', 'INVENTORY', 'CHAPTER_HEAD'],
            'receiving-discrepancies/{id}', 'Receiving discrepancy is awaiting resolution.',
            fn () => ReceivingDiscrepancy::where('chapter_id', $chapterId)->whereIn('status', Records::OPEN_DISCREPANCY)
                ->with('receivingReport')->orderBy('id')->get()->map(fn ($row) => [
                    $row->id, $row->receivingReport?->rm_reference, self::timestamp($row, $row->created_at),
                ]));
        $add('active_missing_source_hold', 'warning', 'receiving_hold', ['RECEIVING', 'INVENTORY', 'CHAPTER_HEAD'],
            'receiving-holds/{id}', 'Undocumented delivery is awaiting source linkage or refusal.',
            fn () => ReceivingHold::where('chapter_id', $chapterId)->where('status', 'held')->orderBy('id')->get()
                ->map(fn ($row) => [$row->id, null, self::timestamp($row, $row->arrived_at)]));
        $add('open_rf_shortage', 'warning', 'internal_rf', ['INVENTORY', 'PURCHASING', 'DISPATCH'],
            'allocation-queue?rf_id={id}', 'Approved RF has outstanding demand without an active reservation.',
            fn () => Records::rfLines($chapterId)->get()
                ->filter(fn ($line) => $line->rf->status === 'approved' && BcMath::isPositive(Records::shortage($line)))
                ->unique('rf_id')->sortBy('rf_id')->map(fn ($line) => [
                    $line->rf_id, $line->rf->rf_number, RepfResource::instant($line->rf->approved_at), $line->rf->requesting_unit_id,
                ]));

        return $alerts;
    }

    private function lowStock(string $chapterId, CarbonImmutable $now): Collection
    {
        $variants = Records::variants($chapterId)->where('is_active', true)->where('state', 'active')->orderBy('id')->get();
        $thresholds = $this->inventory->thresholds($chapterId, $now, $variants);
        $breaches = $this->inventory->breaches($chapterId, $variants, $thresholds);

        return $variants->whereIn('id', array_keys($breaches))
            ->map(fn ($variant) => [
                $variant->id, $variant->code, RepfResource::instant($breaches[$variant->id]),
            ]);
    }

    private static function timestamp($record, ?\DateTimeInterface $at = null): string
    {
        return RepfResource::instant($at ?? $record->updated_at ?? $record->created_at ?? CarbonImmutable::createFromTimestampUTC(0));
    }
}
