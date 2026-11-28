<?php

namespace App\Services\Receiving;

use App\Http\Resources\DonationResource;
use App\Http\Resources\RepfResource;
use App\Models\CatalogueLocation;
use App\Models\DonationLine;
use App\Models\DonationRestrictionResolution;
use App\Models\InventoryLot;
use App\Models\PurchaseOrder;
use App\Models\ReceivingDiscrepancy;
use App\Models\ReceivingHold;
use App\Models\ReceivingReport;
use App\Models\Repf;
use App\Models\Stage2RecordHistory;
use App\Models\User;
use App\Services\Shared\Stage2ReportRecords as Records;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

final class ControlReport
{
    public function build(string $chapterId, array $filters, CarbonImmutable $now): array
    {
        $variants = Records::variants($chapterId, $filters)->with('unit')->get()->keyBy('id');
        $locationId = $filters['location_id'];
        $daReceipts = Records::receipts($chapterId, 'da')->whereIn('variant_id', $variants->keys())->orderBy('id')->get()->groupBy('source_line_id');
        $eligibleLots = InventoryLot::where('chapter_id', $chapterId)->where('source_kind', 'da_rm')
            ->where('quantity_on_hand', '>', 0)->whereIn('condition', ['usable', 'USABLE'])
            ->whereIn('custody', ['stockroom', 'STOCKROOM'])->where('immediately_allocatable', true)
            ->when($locationId, fn (Builder $query, string $id) => $query->where('location_id', $id))
            ->pluck('origin_source_line_id')->flip();

        $allLines = DonationLine::whereIn('variant_id', $variants->keys())
            ->whereHas('donation', fn (Builder $query) => $query->where('chapter_id', $chapterId))
            ->with(['donation', 'unit'])->orderBy('id')->get()
            ->filter(fn ($line) => $locationId === null || $daReceipts->get($line->id, collect())
                ->contains(fn ($receipt) => $receipt->receivingReport->location_id === $locationId));

        $status = $filters['status'];
        $historyLocations = $locationId === null ? [] : $this->recordsAtLocation($chapterId, $locationId);
        $donations = $allLines->filter(fn ($line) => $this->inPeriod($line->donation->created_at, $filters)
            && match ($status) {
                'all' => true,
                'uninterpreted_restriction' => $line->restrictions['state'] === 'uninterpreted',
                'bounded_restriction' => $line->restrictions['state'] === 'bounded',
                'resolved' => in_array($line->donation->status, ['received', 'closed_short', 'declined', 'canceled'], true),
                default => false,
            })->map(function (DonationLine $line) use ($variants, $daReceipts, $eligibleLots, $locationId) {
                $da = $line->donation;
                $receipts = $daReceipts->get($line->id, collect())
                    ->filter(fn ($receipt) => $locationId === null || $receipt->receivingReport->location_id === $locationId);
                $location = $receipts->sortByDesc(fn ($receipt) => $receipt->receivingReport->posted_at)->first()?->receivingReport->location_id;
                $variant = $variants->get($line->variant_id);

                return [
                    'da_id' => $da->id, 'da_reference' => $da->reference, 'da_status' => $da->status,
                    'donor_name' => mb_substr($da->donor_name, 0, 160), 'location_id' => $location,
                    'item_id' => $variant->item_id, 'variant_id' => $variant->id, 'variant_code' => $variant->code,
                    'unit_id' => $line->unit_id, 'unit_code' => $line->unit->code, 'quantity_scale' => $line->quantity_scale,
                    'declared_quantity' => DonationResource::quantity($line, 'pledged_quantity'),
                    'received_quantity' => $locationId === null ? DonationResource::quantity($line, 'received_quantity')
                        : Records::sum($receipts, 'accepted_quantity', $line->quantity_scale),
                    'declared_value_php' => $line->pledged_value_php,
                    'restriction' => $line->restrictions,
                    'allocatable_now' => $line->restrictions['state'] !== 'uninterpreted' && $eligibleLots->has($line->id),
                ];
            })->values();

        $resolutions = Records::period(DonationRestrictionResolution::where('chapter_id', $chapterId)
            ->whereIn('da_line_id', $allLines->pluck('id')), 'committed_at', $filters)
            ->with('donation')->orderByDesc('committed_at')->orderBy('id')->get()
            ->filter(fn ($row) => match ($status) {
                'all', 'resolved' => true,
                'uninterpreted_restriction' => $row->restrictions['state'] === 'uninterpreted',
                'bounded_restriction' => $row->restrictions['state'] === 'bounded',
                default => false,
            })->values();
        $overdue = $this->overdue($chapterId, $variants->keys(), $allLines, $daReceipts, $filters, $now);
        $history = Records::period(Stage2RecordHistory::where('chapter_id', $chapterId), 'recorded_at', $filters)
            ->orderByDesc('recorded_at')->orderBy('id')->get()
            ->filter(fn (Stage2RecordHistory $row) => $this->matchesHistory($row, $variants->keys(), $filters, $allLines, $overdue, $historyLocations))
            ->values();
        $actors = User::whereKey($resolutions->pluck('actor_id')->merge($history->pluck('actor_user_id'))->unique()->values()->all())
            ->get()->keyBy('id');

        return [[
            'donation_restrictions' => $donations->all(),
            'restriction_resolutions' => $resolutions->map(fn ($row) => [
                'resolution_id' => $row->id, 'da_id' => $row->da_id, 'da_reference' => $row->donation->reference,
                'da_line_id' => $row->da_line_id, 'previous_state' => $row->previous_restrictions['state'],
                'resolved_state' => $row->restrictions['state'], 'affected_lot_count' => count($row->updated_lot_ids),
                'evidence_id' => $row->binding['evidence_id'], 'actor' => $this->actor($actors, $row->actor_id),
                'resolved_at' => RepfResource::instant($row->committed_at), 'reason' => $row->reason,
            ])->all(),
            'overdue_exceptions' => $overdue,
            'audit_history' => $history->map(fn (Stage2RecordHistory $row) => $this->auditRow($row, $actors))->all(),
        ], [
            'donation_row_count' => $donations->count(),
            'uninterpreted_donation_count' => $donations->filter(fn ($row) => $row['restriction']['state'] === 'uninterpreted')->pluck('da_id')->unique()->count(),
            'resolution_count' => $resolutions->count(), 'overdue_exception_count' => count($overdue),
            'audit_entry_count' => $history->count(),
            'total_declared_donation_value_php' => Records::sum($donations, 'declared_value_php'),
        ], []];
    }

    private function overdue(string $chapterId, Collection $variantIds, Collection $donationLines, Collection $daReceipts, array $filters, CarbonImmutable $now): array
    {
        $rows = [];
        $selectedLocation = $filters['location_id'];
        $status = $filters['status'];
        $add = function (string $kind, $record, ?string $reference, ?string $locationId, string $duty, CarbonImmutable $since, int $sla, string $summary) use (&$rows, $filters, $now, $selectedLocation): void {
            if (($selectedLocation !== null && $locationId !== $selectedLocation) || ! $this->inPeriod($since, $filters)) {
                return;
            }
            $overdue = $since->addHours($sla)->diffInSeconds($now);
            if ($overdue <= 0) {
                return;
            }

            $rows[] = [
                'exception_kind' => $kind, 'record_id' => $record->id, 'record_reference' => $reference,
                'location_id' => $locationId, 'responsible_duty' => $duty, 'status' => $record->status,
                'due_or_since_at' => RepfResource::instant($since), 'overdue_hours' => (int) ceil($overdue / 3600),
                'summary' => $summary,
            ];
        };

        if (in_array($status, ['all', 'overdue_exception'], true)) {
            $rfLocations = $selectedLocation === null ? null : Records::rfLinesAtLocation($chapterId, $selectedLocation);
            $repfs = Repf::where('chapter_id', $chapterId)->where('status', 'pending_budget_review')
                ->whereHas('lines', fn (Builder $query) => $query->whereIn('variant_id', $variantIds)
                    ->when($rfLocations !== null, fn (Builder $lines) => $lines->whereIn('rf_line_id', array_keys($rfLocations ?? []))))
                ->orderBy('id')->get();
            foreach ($repfs as $repf) {
                $add('overdue_repf_approval', $repf, $repf->repf_reference, $selectedLocation, 'BUDGET_APPROVER',
                    $this->submittedAt($repf), (int) config('stage2.sla_hours.repf_approval'), 'Replenishment request is overdue for budget review.');
            }
            $locations = CatalogueLocation::where('chapter_id', $chapterId)->get();
            $receiptLocations = Records::receiptLocations($chapterId, 'po');
            $orders = PurchaseOrder::where('chapter_id', $chapterId)->whereIn('status', ['pending_approval', ...Records::OPEN_PO])
                ->whereHas('lines', fn (Builder $query) => $query->whereIn('variant_id', $variantIds))
                ->orderBy('id')->get();
            foreach ($orders as $po) {
                $receivedAt = $receiptLocations->get($po->id, collect());
                $locationId = $receivedAt->contains($selectedLocation) ? $selectedLocation
                    : ($receivedAt->first() ?? Records::deliveryLocation($po->delivery_location, $locations)?->id);
                if ($po->status === 'pending_approval') {
                    $add('overdue_po_approval', $po, $po->po_reference, $locationId, 'BUDGET_APPROVER',
                        $this->submittedAt($po), (int) config('stage2.sla_hours.po_approval'), 'Purchase Order is overdue for approval.');

                    continue;
                }
                $deliveryDate = CarbonImmutable::parse($po->revised_expected_delivery_date ?? $po->expected_delivery_date, 'Asia/Manila')->endOfDay()->utc();
                $add('overdue_po_delivery', $po, $po->po_reference, $locationId, 'PURCHASING', $deliveryDate, 0, 'Purchase Order delivery is overdue.');
            }
        }

        if (in_array($status, ['all', 'overdue_exception', 'discrepancy_open'], true)) {
            $discrepancies = ReceivingDiscrepancy::where('chapter_id', $chapterId)->whereIn('status', Records::OPEN_DISCREPANCY)
                ->whereIn('variant_id', $variantIds)->with('receivingReport')->orderBy('id')->get();
            foreach ($discrepancies as $row) {
                $add('overdue_receiving_discrepancy', $row, $row->receivingReport->rm_reference, $row->receivingReport->location_id,
                    'RECEIVING', $row->created_at->toImmutable(), (int) config('stage2.sla_hours.receiving_discrepancy'), 'Receiving discrepancy is overdue for resolution.');
            }
        }

        if (in_array($status, ['all', 'overdue_exception', 'hold_open'], true)) {
            foreach (ReceivingHold::where('chapter_id', $chapterId)->where('status', 'held')->orderBy('id')->get() as $hold) {
                if (($filters['item_id'] || $filters['variant_id']) && ! collect($hold->items)->whereIn('variant_id', $variantIds)->count()) {
                    continue;
                }
                $add('overdue_missing_source_hold', $hold, null, $hold->holding_location_id, 'RECEIVING', $hold->arrived_at,
                    (int) config('stage2.sla_hours.missing_source_hold'), 'Missing-source delivery hold is overdue for resolution.');
            }
        }

        if (in_array($status, ['all', 'overdue_exception', 'uninterpreted_restriction'], true)) {
            foreach ($donationLines as $line) {
                $da = $line->donation;
                if ($line->restrictions['state'] !== 'uninterpreted' || ! in_array($da->status, ['acknowledged', 'partially_received', 'received', 'closed_short'], true)) {
                    continue;
                }
                $receipts = $daReceipts->get($line->id, collect());
                $locationId = $selectedLocation ?? $receipts->first()?->receivingReport->location_id;
                $since = CarbonImmutable::parse($da->acknowledgment['committed_at'] ?? $da->acknowledgment['signed_at'] ?? $da->created_at, 'UTC');
                $add('unresolved_uninterpreted_restriction', $da, $da->reference, $locationId, 'CHAPTER_HEAD', $since,
                    (int) config('stage2.sla_hours.uninterpreted_restriction'), 'Donation still has an uninterpreted donor restriction.');
            }
        }

        return collect($rows)->unique(fn ($row) => $row['exception_kind'].'|'.$row['record_id'])->values()->all();
    }

    private function submittedAt(Repf|PurchaseOrder $record): CarbonImmutable
    {
        return CarbonImmutable::parse($record->review_json['submitted_at'] ?? $record->updated_at, 'UTC');
    }

    private function inPeriod(\DateTimeInterface $at, array $filters): bool
    {
        return $at >= Records::periodStart($filters['date_from']) && $at < Records::periodStart($filters['date_to'])->addDay();
    }

    private function actor(Collection $actors, string $id): array
    {
        $user = $actors->get($id);

        return $user === null ? ['user_id' => $id, 'display_name' => 'Former officer'] : RepfResource::actor($user);
    }

    private function recordsAtLocation(string $chapterId, string $locationId): array
    {
        $rms = ReceivingReport::where('chapter_id', $chapterId)->where('location_id', $locationId)
            ->get(['id', 'source_id', 'source_kind', 'status']);
        $location = CatalogueLocation::where('chapter_id', $chapterId)->findOrFail($locationId);
        $poIds = $rms->where('source_kind', 'po')->where('status', 'posted')->pluck('source_id');
        $orders = PurchaseOrder::where('chapter_id', $chapterId)->where(fn (Builder $query) => $query
            ->whereIn('id', $poIds)->orWhereIn('delivery_location', [$locationId, $location->name]))
            ->get(['id', 'repf_id']);
        $rfLines = Records::rfLinesAtLocation($chapterId, $locationId);
        $repfs = Repf::where('chapter_id', $chapterId)
            ->whereHas('lines', fn (Builder $lines) => $lines->whereIn('rf_line_id', array_keys($rfLines)))
            ->pluck('id')->merge($orders->pluck('repf_id'));

        return [
            'receiving_report' => $rms->pluck('id')->flip()->all(),
            'purchase_order' => $orders->pluck('id')->flip()->all(),
            'repf' => $repfs->flip()->all(),
        ];
    }

    private function matchesHistory(Stage2RecordHistory $row, Collection $variants, array $filters, Collection $donations, array $overdue, array $locations): bool
    {
        $snapshot = $row->snapshot_json;
        $status = $snapshot['status'] ?? null;
        $lines = collect($snapshot['lines'] ?? $snapshot['items'] ?? [$snapshot]);
        $daLines = $row->record_kind === 'donation' ? $donations->where('da_id', $row->record_id) : collect();
        if (($filters['variant_id'] || $filters['item_id'])
            && ! $lines->whereIn('variant_id', $variants)->count() && $daLines->isEmpty()) {
            return false;
        }
        if ($filters['location_id'] !== null && $daLines->isEmpty()
            && ($snapshot['location_id'] ?? $snapshot['holding_location_id'] ?? null) !== $filters['location_id']
            && ! isset($locations[$row->record_kind][$row->record_id])
            && ! isset($locations['receiving_report'][$snapshot['rm_id'] ?? ''])) {
            return false;
        }

        return match ($filters['status']) {
            'all' => true,
            'uninterpreted_restriction' => $daLines->contains(fn ($line) => $line->restrictions['state'] === 'uninterpreted'),
            'bounded_restriction' => $daLines->contains(fn ($line) => $line->restrictions['state'] === 'bounded'),
            'overdue_exception' => collect($overdue)->contains('record_id', $row->record_id),
            'discrepancy_open' => $row->record_kind === 'receiving_discrepancy' && in_array($status, Records::OPEN_DISCREPANCY, true),
            'hold_open' => $row->record_kind === 'receiving_hold' && $status === 'held',
            'resolved' => in_array($status, ['resolved', 'linked_to_source', 'rejected_returned', 'receiving_complete', 'received', 'closed_short'], true)
                || $row->event_type === 'resolveDonationRestriction',
        };
    }

    private function auditRow(Stage2RecordHistory $row, Collection $actors): array
    {
        $snapshot = $row->snapshot_json;
        $quotation = ($row->operation_json['resource_kind'] ?? null) === 'quotation';

        return [
            'event_id' => $row->id, 'record_kind' => $quotation ? 'quotation' : $row->record_kind,
            'record_id' => $quotation ? $row->operation_json['resource_id'] : $row->record_id,
            'record_reference' => $quotation ? null : ($snapshot['repf_reference'] ?? $snapshot['po_reference'] ?? $snapshot['rm_reference'] ?? $snapshot['reference'] ?? null),
            'action' => Str::snake($row->event_type), 'actor' => $this->actor($actors, $row->actor_user_id),
            'occurred_at' => RepfResource::instant($row->recorded_at), 'reason' => $row->reason,
        ];
    }
}
