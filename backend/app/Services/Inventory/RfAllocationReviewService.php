<?php

namespace App\Services\Inventory;

use App\Exceptions\ContractException;
use App\Models\InternalRf;
use App\Models\InternalRfLine;
use App\Models\InventoryLot;
use App\Services\Authority\ChapterAuthority;
use App\Services\Shared\BcMath;
use Carbon\CarbonInterface;

final class RfAllocationReviewService
{
    public function __construct(
        private InternalRfService $rfs,
        private StockViewQueryService $stockViews,
        private AllocationQueueQueryService $queue,
        private AllocationSnapshotPage $pagination,
    ) {}

    public function stockRangeReview(InternalRf $rf): array
    {
        $observedAt = now('UTC');
        $lines = [];
        foreach ($rf->lines as $line) {
            $lines[] = [
                'rf_line_id' => $line->id,
                'variant_id' => $line->variant_id,
                'unit_id' => $line->unit_id,
                'views' => $this->stockViews->getSevenViews($rf->chapter_id, $line->variant_id, $line->identity_at_approval['quantity_scale'] ?? 0),
                'candidate_lots' => $this->candidateLots($rf, $line, $observedAt),
            ];
        }

        return [
            'rf' => $this->rfs->formatRf($rf),
            'observed_at' => $observedAt->format('Y-m-d\TH:i:s.u\Z'),
            'lines' => $lines,
        ];
    }

    public function reviewLine(ChapterAuthority $authority, InternalRf $rf, InternalRfLine $line, int $limit, ?string $cursor): array
    {
        $observedAt = now('UTC');
        $progress = collect($this->rfs->formatRf($rf)['lines'])->firstWhere('id', $line->id)['progress'];
        $free = '0';
        foreach ($this->candidateLots($rf, $line, $observedAt) as $lot) {
            foreach ($lot['free_intervals'] as $range) {
                $free = BcMath::add($free, $range['quantity']);
            }
        }

        $scale = $line->identity_at_approval['quantity_scale'] ?? 0;
        [$policy, $demands, $nextCursor, $blockers] = $this->orderedDemandPage($authority, $rf, $line, $limit, $cursor);

        return [
            'rf_id' => $rf->id,
            'rf_line_id' => $line->id,
            'rf_version' => $rf->version,
            'rf_material_version' => $rf->material_version,
            'rf_progress_version' => $rf->progress_version,
            'progress' => $progress,
            'free_eligible_quantity' => BcMath::format($free, $scale),
            'uncovered_quantity' => BcMath::format(BcMath::max('0', BcMath::sub($progress['unreserved_quantity'], $free)), $scale),
            'allocation_policy' => $policy,
            'ordered_demands' => $demands,
            'queue_next_cursor' => $nextCursor,
            'setup_blockers' => $blockers,
            'observed_at' => $observedAt->format('Y-m-d\TH:i:s.u\Z'),
            'is_commit_authorization' => false,
        ];
    }

    private function candidateLots(InternalRf $rf, InternalRfLine $line, CarbonInterface $observedAt): array
    {
        if ($rf->status !== 'approved') {
            return [];
        }

        $lots = InventoryLot::where('chapter_id', $rf->chapter_id)->where('variant_id', $line->variant_id)
            ->where('unit_id', $line->unit_id)->where('condition', 'USABLE')->where('custody', 'STOCKROOM')
            ->withExists('restrictions')->orderBy('created_at')->orderBy('id')->get();
        $lotRanges = $this->stockViews->loadLotRanges($lots, protectSales: true);
        $candidates = [];
        foreach ($lots as $lot) {
            $ranges = $lotRanges[$lot->id];
            $available = $this->stockViews->getLotAvailability($lot, $observedAt, $rf->purpose, $rf, ranges: $ranges);
            if (BcMath::isPositive($available['eligible_free_quantity'])) {
                $candidates[] = [
                    'stock_lot_id' => $lot->id,
                    'basis_segment_id' => $lot->basis_segment_id ?? $lot->id,
                    'quantity_on_hand' => $lot->quantity_on_hand,
                    'stock_version' => $lot->stock_version,
                    'material_version' => $lot->material_version,
                    'active_holds' => $ranges['holds'],
                    'active_reservations' => $ranges['reservations'],
                    'free_intervals' => $available['free_intervals'],
                ];
            }
        }

        return $candidates;
    }

    private function orderedDemandPage(
        ChapterAuthority $authority,
        InternalRf $rf,
        InternalRfLine $line,
        int $limit,
        ?string $cursor,
    ): array {
        try {
            $queue = $this->queue->buildQueue($authority, ['variant_id' => $line->variant_id, 'eligible_only' => false]);
        } catch (ContractException $exception) {
            if ($exception->errorCode !== 'setup_blocked') {
                throw $exception;
            }

            return [null, [], null, $exception->extra['blockers'] ?? []];
        }

        $reference = $queue['allocation_policy'];
        $policyRecord = $authority->chapter->policyRecords()->where('policy_code', 'allocation_priority')
            ->where('aggregate_id', $reference['policy_id'])->where('policy_version', $reference['version'])->first();
        $approval = collect($policyRecord?->setupEvidence()['approvals'] ?? [])->firstWhere('authority', 'CHAPTER_HEAD');
        $policy = isset($approval['id'], $approval['approver_id']) ? [
            'policy_id' => $reference['policy_id'],
            'material_version' => $reference['version'],
            'approval_id' => $approval['id'],
            'approved_by' => $approval['approver_id'],
        ] : null;
        $page = $this->pagination->paginate(
            $queue['entries'], $cursor, $limit, 'rf_allocation_review', $authority->membership->user_id,
            $rf->chapter_id, $authority->version, $queue['snapshot_version'], ['rf_id' => $rf->id, 'rf_line_id' => $line->id],
            array_diff_key($queue, ['observed_at' => true]),
        );
        $demands = array_map(static fn (array $demand): array => [
            'rf_id' => $demand['rf_id'],
            'rf_line_id' => $demand['rf_line_id'],
            'priority_rank' => $demand['priority_rank'],
            'needed_at' => $demand['needed_at'],
            'approved_at' => $demand['approved_at'],
            'unreserved_quantity' => $demand['unreserved_outstanding_quantity'],
        ], $page['entries']);

        return [$policy, $demands, $page['next_cursor'], []];
    }
}
