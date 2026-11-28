<?php

namespace App\Services\Inventory\Participants;

use App\Models\InventoryLot;
use App\Models\StockReservation;
use App\Services\Inventory\ReservationService;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\BcMath;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class ApplyLotRestrictionResolutionParticipant
{
    private const REQUIRED_INPUT_KEYS = [
        'chapter_id',
        'da_id',
        'da_line_id',
        'resolution_id',
        'previous_restrictions',
        'restrictions',
    ];

    public function __construct(
        private ?DomainNotificationOutboxService $outbox = null,
    ) {
        $this->outbox ??= app(DomainNotificationOutboxService::class);
    }

    /**
     * Synchronous internal Stage 2 participant (`applyLotRestrictionResolution`).
     * Runs strictly inside Leader's single outer database transaction and exposes zero HTTP routes.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function apply(array $input): array
    {
        if (DB::transactionLevel() === 0) {
            throw new RuntimeException('ApplyLotRestrictionResolutionParticipant requires an active outer transaction.');
        }

        if (! $this->isValidClosedInput($input)) {
            return $this->rejectTargetLocked();
        }

        $chapterId = $input['chapter_id'];
        $daId = $input['da_id'];
        $daLineId = $input['da_line_id'];
        $previousRestrictions = DonationRestrictionSupport::canonicalize($input['previous_restrictions']);
        $newRestrictions = DonationRestrictionSupport::canonicalize($input['restrictions']);

        // Lock matching remaining stockroom lots deterministically in ascending lot UUID order.
        $lots = InventoryLot::where('chapter_id', $chapterId)
            ->where('source_type', 'da_rm')
            ->where('source_doc_id', $daId)
            ->where('source_line_id', $daLineId)
            ->where('custody', 'STOCKROOM')
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        $plannedUpdates = [];

        foreach ($lots as $lot) {
            if (BcMath::comp((string) $lot->quantity_on_hand, '0') <= 0) {
                continue;
            }

            if ($lot->chapter_id !== $chapterId
                || $lot->source_doc_id !== $daId
                || $lot->source_line_id !== $daLineId
                || strtoupper((string) $lot->custody) !== 'STOCKROOM') {
                return $this->rejectTargetLocked();
            }

            $segments = $lot->segments;
            if (! is_array($segments) || $segments === []) {
                return $this->rejectTargetLocked();
            }

            // Lock/verify segments deterministically by sorted segment ID per contract (lot_id, segment_id).
            $indexedSegments = [];
            foreach ($segments as $idx => $segment) {
                if (! is_array($segment) || ! isset($segment['id']) || ! is_string($segment['id'])) {
                    return $this->rejectTargetLocked();
                }
                $indexedSegments[] = ['idx' => $idx, 'id' => $segment['id'], 'segment' => $segment];
            }
            usort($indexedSegments, static fn (array $a, array $b): int => strcmp($a['id'], $b['id']));

            $updatedSegments = $segments;
            $lotSegmentChanged = false;

            foreach ($indexedSegments as $item) {
                $seg = $item['segment'];
                $segQty = (string) ($seg['quantity'] ?? '0');
                if (BcMath::comp($segQty, '0') <= 0) {
                    continue;
                }

                $currentRestrictions = $seg['restrictions'] ?? null;
                if (! is_array($currentRestrictions)
                    || ! DonationRestrictionSupport::equals($currentRestrictions, $previousRestrictions)) {
                    return $this->rejectTargetLocked();
                }

                $updatedSegments[$item['idx']]['restrictions'] = $newRestrictions;
                $lotSegmentChanged = true;
            }

            if ($lotSegmentChanged) {
                $plannedUpdates[] = [
                    'lot' => $lot,
                    'segments' => $updatedSegments,
                ];
            }
        }

        if ($plannedUpdates === []) {
            return [
                'outcome' => 'ready',
                'updated_lot_ids' => [],
            ];
        }

        $updatedLotIds = [];
        $updatedAt = now('UTC');
        $newAllocatableState = $newRestrictions['state'] !== 'uninterpreted';

        foreach ($plannedUpdates as $plan) {
            /** @var InventoryLot $lot */
            $lot = $plan['lot'];
            $lot->segments = $plan['segments'];
            $lot->immediately_allocatable = strtoupper((string) $lot->condition) === 'USABLE'
                && strtoupper((string) $lot->custody) === 'STOCKROOM'
                && $newAllocatableState;
            $lot->stock_version = ((int) $lot->stock_version) + 1;
            $lot->updated_at = $updatedAt;
            $lot->save();

            $updatedLotIds[] = $lot->id;

            $this->outbox->recordIntent(
                'stage1.stock-lot.changed.v1',
                $chapterId,
                $lot->id,
                (int) $lot->stock_version,
                (int) $lot->material_version,
            );
        }

        $this->refreshActiveReservationBlockedBalances($chapterId, $updatedLotIds);

        $updatedLotIds = array_values(array_unique($updatedLotIds));
        sort($updatedLotIds);

        return [
            'outcome' => 'ready',
            'updated_lot_ids' => $updatedLotIds,
        ];
    }

    /** @return array{outcome: string, reason: string} */
    private function rejectTargetLocked(): array
    {
        return [
            'outcome' => 'rejected',
            'reason' => 'target_locked',
        ];
    }

    private function isValidClosedInput(array $input): bool
    {
        if (! DonationRestrictionSupport::hasExactKeys($input, self::REQUIRED_INPUT_KEYS)) {
            return false;
        }

        foreach (['chapter_id', 'da_id', 'da_line_id', 'resolution_id'] as $uuidField) {
            if (! DonationRestrictionSupport::isUuid($input[$uuidField] ?? null)) {
                return false;
            }
        }

        if (! DonationRestrictionSupport::isValid($input['previous_restrictions'] ?? null, ['bounded', 'uninterpreted'], false)) {
            return false;
        }

        return DonationRestrictionSupport::isValid($input['restrictions'] ?? null, ['bounded', 'unrestricted'], true);
    }

    /**
     * Recompute derived reservation blocked balances without altering reservation statuses or holds.
     *
     * @param  list<string>  $lotIds
     */
    private function refreshActiveReservationBlockedBalances(string $chapterId, array $lotIds): void
    {
        $activeReservations = StockReservation::where('chapter_id', $chapterId)
            ->where('status', 'ACTIVE')
            ->where(function ($q) use ($lotIds) {
                $q->whereIn('lot_id', $lotIds)
                    ->orWhereHas('allocations', fn ($aq) => $aq->whereIn('lot_id', $lotIds));
            })
            ->lockForUpdate()
            ->get();

        if ($activeReservations->isEmpty()) {
            return;
        }

        $reservationService = app(ReservationService::class);
        foreach ($activeReservations as $reservation) {
            $reservationService->syncReservationStateAndBlocked($reservation);
            $reservation->save();
        }
    }
}
