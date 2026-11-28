<?php

namespace App\Services\Inventory;

use App\Exceptions\ContractException;
use App\Models\ActualIssue;
use App\Models\ActualIssueHistory;
use App\Models\EvidenceBinding;
use App\Models\Handover;
use App\Models\IdempotencyRecord;
use App\Models\InternalRf;
use App\Models\InternalRfLine;
use App\Models\InternalRfVersion;
use App\Models\InventoryLot;
use App\Models\PolicyRecord;
use App\Models\RfReservationAllocation;
use App\Models\RfReservationHistory;
use App\Models\RfReservationPreparation;
use App\Models\StockHold;
use App\Models\StockHoldHistory;
use App\Models\StockHoldRange;
use App\Models\StockReservation;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Inventory\Participants\PrepareRfDemandChangeParticipant;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\BcMath;
use App\Services\Shared\CanonicalJson;
use DomainException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReservationService
{
    public function __construct(
        protected PrepareRfDemandChangeParticipant $demandParticipant,
        protected InternalRfService $rfService,
        protected CheckEvidenceBindingParticipant $checkEvidenceBinding,
        protected DomainNotificationOutboxService $outbox,
        protected ?StockViewQueryService $stockViewQuery = null
    ) {
        $this->stockViewQuery = $stockViewQuery ?? app(StockViewQueryService::class);
    }

    public function prepareReservation(string $chapterId, string $rfId, string $actorId, array $input, ?string $actionKey = null): array
    {
        $targets = $input['targets'] ?? [];
        if (! is_array($targets) || empty($targets)) {
            throw new ContractException(422, 'invalid_input', 'targets must be a non-empty array.');
        }

        foreach ($targets as $idx => $t) {
            if (! is_string($t['quantity'] ?? null) || ! preg_match('/^\d+(?:\.\d{1,6})?$/', $t['quantity'])) {
                throw new ContractException(422, 'invalid_input', "Target {$idx} quantity must be a decimal string.", [
                    'fields' => [['pointer' => "/targets/{$idx}/quantity", 'code' => 'invalid_type']],
                ]);
            }
            if (! is_string($t['offset_quantity'] ?? null) || ! preg_match('/^\d+(?:\.\d{1,6})?$/', $t['offset_quantity'])) {
                throw new ContractException(422, 'invalid_input', "Target {$idx} offset_quantity must be a decimal string.");
            }
            if (BcMath::comp($t['quantity'], '0') <= 0) {
                throw new ContractException(422, 'invalid_input', "Target {$idx} quantity must be positive.");
            }
        }

        BcMath::assertDisjointIntervals($targets);

        if (! empty($input['override_policy_id'])) {
            $policy = PolicyRecord::where('id', $input['override_policy_id'])
                ->where('chapter_id', $chapterId)
                ->first();
            $createdBy = $policy?->rules_json['created_by_user_id'] ?? $policy?->rules_json['approver_user_id'] ?? null;
            if (! $policy || $createdBy === $actorId) {
                throw new ContractException(409, 'override_denied', 'override denied', [
                    'failed_intent_committed' => false,
                    'current' => ['rf' => null, 'preparation' => null, 'reservation' => null, 'hold' => null, 'review' => null],
                    'setup_blockers' => [],
                ]);
            }
        }

        $rf = InternalRf::where('chapter_id', $chapterId)->where('id', $rfId)->with('lines')->first();
        if (! $rf) {
            throw new ContractException(404, 'resource_not_found', "Internal RF {$rfId} not found.");
        }
        if ($rf->status !== 'approved') {
            throw new ContractException(409, 'approval_invalid', 'RF must be approved before preparing reservation.', [
                'failed_intent_committed' => false,
                'current' => ['rf' => $this->rfService->formatRf($rf)],
            ]);
        }

        $rfLineId = (string) ($input['rf_line_id'] ?? '');
        $rfLine = $rf->lines->firstWhere('id', $rfLineId);
        if (! $rfLine) {
            throw new ContractException(404, 'resource_not_found', "RF line {$rfLineId} not found.");
        }

        return DB::transaction(function () use ($chapterId, $rf, $rfLine, $actorId, $input, $targets, $actionKey) {
            // Capture lot pins for clients that prepared ranges before pins were exposed by the picker.
            $lots = InventoryLot::where('chapter_id', $chapterId)->whereIn('id', array_column($targets, 'stock_lot_id'))
                ->get(['id', 'material_version', 'stock_version'])->keyBy('id');
            foreach ($targets as &$target) {
                $lot = $lots->get($target['stock_lot_id'] ?? '');
                if ($lot !== null) {
                    $target['expected_lot_material_version'] ??= $lot->material_version;
                    $target['expected_stock_version'] ??= $lot->stock_version;
                }
            }
            unset($target);

            $advisory = [
                'observed_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'requested_total' => $this->sumTargetQuantities($targets),
            ];

            $prep = RfReservationPreparation::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $chapterId,
                'rf_id' => $rf->id,
                'rf_line_id' => $rfLine->id,
                'actor_user_id' => $actorId,
                'status' => 'prepared',
                'version' => 1,
                'expected_rf_version' => (int) ($input['expected_rf_version'] ?? $rf->version),
                'expected_rf_material_version' => (int) ($input['expected_rf_material_version'] ?? $rf->material_version),
                'expected_rf_progress_version' => (int) ($input['expected_rf_progress_version'] ?? $rf->progress_version),
                'targets_json' => $targets,
                'advisory_review_json' => $advisory,
                'override_policy_id' => $input['override_policy_id'] ?? null,
                'observed_at' => now(),
            ]);

            $formatted = $this->formatPreparation($prep);
            $this->outbox->recordIntent('stage1.reservation-preparation.changed.v1', $chapterId, $prep->id, $prep->version, null);

            return $this->operationEnvelope(
                $chapterId,
                $actorId,
                'prepareRfReservation',
                $actionKey,
                'preparation',
                $prep->id,
                201,
                $formatted,
                $input
            );
        });
    }

    public function commitReservation(string $chapterId, string $rfId, string $preparationId, string $actorId, array $input, ?string $actionKey = null): array
    {
        return DB::transaction(function () use ($chapterId, $rfId, $preparationId, $actorId, $input, $actionKey) {
            $prep = RfReservationPreparation::where('chapter_id', $chapterId)
                ->where('rf_id', $rfId)
                ->where('id', $preparationId)
                ->lockForUpdate()
                ->first();

            if (! $prep) {
                throw new ContractException(404, 'resource_not_found', "Reservation preparation {$preparationId} not found.");
            }

            if ($prep->status === 'committed') {
                $existingRes = StockReservation::where('id', $prep->committed_reservation_id)->first();
                throw new ContractException(409, 'preparation_already_committed', 'Preparation has already been committed.', [
                    'failed_intent_committed' => false,
                    'current' => ['reservation' => $existingRes ? $this->formatReservation($existingRes) : null],
                ]);
            }

            if (isset($input['expected_preparation_version']) && (int) $input['expected_preparation_version'] !== (int) $prep->version) {
                throw new ContractException(409, 'version_conflict', 'expected_preparation_version mismatch.', [
                    'failed_intent_committed' => false,
                ]);
            }

            $rf = $this->rfService->lockRfOrFail($chapterId, $rfId);
            $rfLine = InternalRfLine::where('rf_id', $rf->id)
                ->where('id', $prep->rf_line_id)
                ->lockForUpdate()
                ->firstOrFail();

            if (
                (int) $prep->expected_rf_version !== (int) $rf->version
                || (int) $prep->expected_rf_material_version !== (int) $rf->material_version
                || (int) $prep->expected_rf_progress_version !== (int) $rf->progress_version
                || (isset($input['expected_rf_version']) && (int) $input['expected_rf_version'] !== (int) $rf->version)
                || (isset($input['expected_rf_material_version']) && (int) $input['expected_rf_material_version'] !== (int) $rf->material_version)
                || (isset($input['expected_rf_progress_version']) && (int) $input['expected_rf_progress_version'] !== (int) $rf->progress_version)
            ) {
                throw new ContractException(409, 'version_conflict', 'RF versions changed since preparation.', [
                    'failed_intent_committed' => false,
                    'current' => ['rf' => $this->rfService->formatRf($rf)],
                ]);
            }

            $targets = $prep->targets_json ?? [];
            $sortedLotIds = collect($targets)->pluck('stock_lot_id')->unique()->sort()->values()->all();
            $lots = InventoryLot::where('chapter_id', $chapterId)
                ->whereIn('id', $sortedLotIds)
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $totalQty = BcMath::str('0');
            foreach ($targets as $target) {
                $lotId = (string) $target['stock_lot_id'];
                /** @var InventoryLot|null $lot */
                $lot = $lots->get($lotId);

                if (! $lot) {
                    throw new ContractException(404, 'resource_not_found', "Stock lot {$lotId} not found.", [
                        'failed_intent_committed' => false,
                    ]);
                }

                $this->assertLotTargetAvailable($lot, $target, $rf, $rfLine);
                $totalQty = BcMath::add($totalQty, $target['quantity']);
            }

            // Check RF remaining unreserved demand
            $approved = BcMath::str($rfLine->approved_quantity);
            $issued = BcMath::str($rfLine->issued_quantity);
            $canceled = BcMath::str($rfLine->canceled_quantity);
            $reserved = BcMath::str($rfLine->reserved_quantity);
            $unreserved = BcMath::sub(BcMath::sub(BcMath::sub($approved, $issued), $canceled), $reserved);

            if (BcMath::comp($totalQty, $unreserved) > 0) {
                throw new ContractException(409, 'availability_conflict', 'Requested reservation exceeds remaining unreserved RF demand.', [
                    'failed_intent_committed' => false,
                    'current' => ['rf' => $this->rfService->formatRf($rf)],
                ]);
            }

            $operationId = (string) Str::uuid();
            $this->demandParticipant->execute([
                'actor_id' => $actorId,
                'chapter_id' => $chapterId,
                'operation_id' => $operationId,
                'change' => 'reserve',
                'rf_id' => $rf->id,
                'rf_line_id' => $rfLine->id,
                'expected_rf_version' => (int) $rf->version,
                'expected_rf_material_version' => (int) $rf->material_version,
                'expected_rf_progress_version' => (int) $rf->progress_version,
                'quantity' => $totalQty,
            ]);

            $firstLotId = $targets[0]['stock_lot_id'] ?? null;
            $reservation = StockReservation::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $chapterId,
                'source_type' => 'RF',
                'source_id' => $rf->id,
                'source_line_id' => $rfLine->id,
                'rf_line_id' => $rfLine->id,
                'preparation_id' => $prep->id,
                'lot_id' => $firstLotId,
                'version' => 1,
                'material_version' => 1,
                'quantity' => $totalQty,
                'committed_quantity' => $totalQty,
                'active_quantity' => $totalQty,
                'fulfilled_quantity' => BcMath::str('0'),
                'released_quantity' => BcMath::str('0'),
                'blocked_quantity' => BcMath::str('0'),
                'status' => 'ACTIVE',
                'state' => 'active',
                'created_by_user_id' => $actorId,
                'expires_at' => null,
            ]);

            foreach ($targets as $target) {
                RfReservationAllocation::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $chapterId,
                    'reservation_id' => $reservation->id,
                    'lot_id' => $target['stock_lot_id'],
                    'basis_segment_id' => $target['basis_segment_id'],
                    'offset_quantity' => BcMath::str($target['offset_quantity']),
                    'quantity' => BcMath::str($target['quantity']),
                    'consumed_quantity' => BcMath::str('0'),
                    'released_quantity' => BcMath::str('0'),
                    'status' => 'active',
                ]);
            }

            $prep->status = 'committed';
            $prep->version += 1;
            $prep->committed_reservation_id = $reservation->id;
            $prep->save();

            $reservation->load('allocations');
            $formattedRes = $this->formatReservation($reservation);
            $this->recordReservationHistory($reservation, 'committed', $actorId, null, $formattedRes);

            $freshRf = $rf->fresh('lines');
            $this->recordRfProgressVersion($freshRf, 'reservation_committed', $actorId, null);

            $this->outbox->recordIntent('stage1.rf-reservation.changed.v1', $chapterId, $reservation->id, $reservation->version, $reservation->material_version);
            $this->outbox->recordIntent('stage1.internal-rf.changed.v1', $chapterId, $freshRf->id, $freshRf->version, $freshRf->material_version);
            $this->outbox->recordIntent('stage1.reservation-preparation.changed.v1', $chapterId, $prep->id, $prep->version, null);

            return $this->operationEnvelope(
                $chapterId,
                $actorId,
                'commitRfReservation',
                $actionKey,
                'reservation',
                $reservation->id,
                201,
                $formattedRes,
                $input,
                $operationId
            );
        });
    }

    public function releaseReservation(string $chapterId, string $rfId, string $reservationId, string $actorId, array $input, ?string $actionKey = null): array
    {
        $reason = trim((string) ($input['reason'] ?? ''));
        if ($reason === '') {
            throw new ContractException(422, 'invalid_input', 'reason is required.');
        }

        $ranges = $input['ranges'] ?? [];
        if (! is_array($ranges) || empty($ranges)) {
            throw new ContractException(422, 'invalid_input', 'ranges must be non-empty.');
        }

        return DB::transaction(function () use ($chapterId, $rfId, $reservationId, $actorId, $input, $reason, $ranges, $actionKey) {
            $rf = $this->rfService->lockRfOrFail($chapterId, $rfId);
            $reservation = StockReservation::where('chapter_id', $chapterId)
                ->where('source_type', 'RF')
                ->where('source_id', $rfId)
                ->where('id', $reservationId)
                ->lockForUpdate()
                ->first();

            if (! $reservation) {
                throw new ContractException(404, 'resource_not_found', "Reservation {$reservationId} not found.");
            }

            $this->assertReservationVersions($reservation, $rf, $input);
            $this->assertNoUnresolvedHandoverForReservation($chapterId, $rf->id, $reservation->id);

            $allocs = RfReservationAllocation::where('reservation_id', $reservation->id)
                ->where('status', 'active')
                ->lockForUpdate()
                ->get();

            $releaseTotal = BcMath::str('0');
            foreach ($ranges as $range) {
                $rLotId = (string) ($range['stock_lot_id'] ?? '');
                $rSegId = (string) ($range['basis_segment_id'] ?? '');
                $rOffset = BcMath::str($range['offset_quantity'] ?? '0');
                $rQty = BcMath::str($range['quantity'] ?? '0');

                if (BcMath::comp($rQty, '0') <= 0) {
                    throw new ContractException(422, 'invalid_input', 'Release range quantity must be positive.');
                }

                $matched = $this->consumeOrReleaseAllocationInterval($allocs, $rLotId, $rSegId, $rOffset, $rQty, 'released');
                if (! $matched) {
                    throw new ContractException(409, 'reservation_conflict', 'Release range is not owned by active allocations of this reservation.', [
                        'failed_intent_committed' => false,
                        'current' => ['reservation' => $this->formatReservation($reservation)],
                    ]);
                }

                $releaseTotal = BcMath::add($releaseTotal, $rQty);
            }

            $operationId = (string) Str::uuid();
            $this->demandParticipant->execute([
                'actor_id' => $actorId,
                'chapter_id' => $chapterId,
                'operation_id' => $operationId,
                'change' => 'release',
                'rf_id' => $rf->id,
                'rf_line_id' => $reservation->rf_line_id ?? $reservation->source_line_id,
                'expected_rf_version' => (int) $rf->version,
                'expected_rf_material_version' => (int) $rf->material_version,
                'expected_rf_progress_version' => (int) $rf->progress_version,
                'quantity' => $releaseTotal,
            ]);

            $reservation->active_quantity = BcMath::sub($reservation->active_quantity ?? $reservation->quantity, $releaseTotal);
            $reservation->released_quantity = BcMath::add($reservation->released_quantity, $releaseTotal);
            $reservation->version += 1;
            $reservation->material_version += 1;
            $reservation->unsetRelation('allocations');
            $this->syncReservationStateAndBlocked($reservation);
            $reservation->save();

            $this->invalidatePreparedBatchesForReservation($chapterId, $rf->id, $reservation->id, $actorId, 'Reservation released');

            $freshRes = $reservation->fresh('allocations');
            $formattedRes = $this->formatReservation($freshRes);
            $this->recordReservationHistory($freshRes, 'released', $actorId, $reason, $formattedRes);

            $freshRf = $rf->fresh('lines');
            $this->recordRfProgressVersion($freshRf, 'reservation_released', $actorId, $reason);

            $this->outbox->recordIntent('stage1.rf-reservation.changed.v1', $chapterId, $freshRes->id, $freshRes->version, $freshRes->material_version);
            $this->outbox->recordIntent('stage1.internal-rf.changed.v1', $chapterId, $freshRf->id, $freshRf->version, $freshRf->material_version);

            return $this->operationEnvelope(
                $chapterId,
                $actorId,
                'releaseRfReservation',
                $actionKey,
                'reservation',
                $freshRes->id,
                200,
                $formattedRes,
                $input,
                $operationId
            );
        });
    }

    public function reallocateReservation(string $chapterId, string $rfId, string $reservationId, string $actorId, array $input, ?string $actionKey = null): array
    {
        $reason = trim((string) ($input['reason'] ?? ''));
        if ($reason === '') {
            throw new ContractException(422, 'invalid_input', 'reason is required.');
        }

        $fromRanges = $input['from_ranges'] ?? [];
        $toTargets = $input['to_targets'] ?? [];
        if (empty($fromRanges) || empty($toTargets)) {
            throw new ContractException(422, 'invalid_input', 'from_ranges and to_targets must be non-empty.');
        }

        $fromSum = BcMath::str('0');
        foreach ($fromRanges as $fr) {
            if (BcMath::comp($fr['quantity'] ?? '0', '0') <= 0) {
                throw new ContractException(422, 'invalid_input', 'from_ranges quantities must be positive.');
            }
            $fromSum = BcMath::add($fromSum, $fr['quantity']);
        }

        $toSum = BcMath::str('0');
        foreach ($toTargets as $tt) {
            if (BcMath::comp($tt['quantity'] ?? '0', '0') <= 0) {
                throw new ContractException(422, 'invalid_input', 'to_targets quantities must be positive.');
            }
            $toSum = BcMath::add($toSum, $tt['quantity']);
        }

        if (BcMath::comp($fromSum, $toSum) !== 0) {
            throw new ContractException(422, 'invalid_input', 'Total from_ranges quantity must equal total to_targets quantity.');
        }

        BcMath::assertDisjointIntervals($fromRanges);
        BcMath::assertDisjointIntervals($toTargets);

        return DB::transaction(function () use ($chapterId, $rfId, $reservationId, $actorId, $input, $reason, $fromRanges, $toTargets, $toSum, $actionKey) {
            $rf = $this->rfService->lockRfOrFail($chapterId, $rfId);
            $reservation = StockReservation::where('chapter_id', $chapterId)
                ->where('source_type', 'RF')
                ->where('source_id', $rfId)
                ->where('id', $reservationId)
                ->lockForUpdate()
                ->first();

            if (! $reservation) {
                throw new ContractException(404, 'resource_not_found', "Reservation {$reservationId} not found.");
            }

            $this->assertReservationVersions($reservation, $rf, $input);
            $this->assertNoUnresolvedHandoverForReservation($chapterId, $rf->id, $reservation->id);

            $allocs = RfReservationAllocation::where('reservation_id', $reservation->id)
                ->where('status', 'active')
                ->lockForUpdate()
                ->get();

            $rfLine = InternalRfLine::where('rf_id', $rf->id)
                ->whereKey($reservation->rf_line_id ?? $reservation->source_line_id)
                ->lockForUpdate()
                ->firstOrFail();

            // Lock all target lots in deterministic order
            $targetLotIds = collect($toTargets)->pluck('stock_lot_id')->unique()->sort()->values()->all();
            $lots = InventoryLot::where('chapter_id', $chapterId)
                ->whereIn('id', $targetLotIds)
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $currentReservation = $this->formatReservation($reservation);

            // Rollback restores these ranges if a replacement is rejected.
            foreach ($fromRanges as $fr) {
                $matched = $this->consumeOrReleaseAllocationInterval(
                    $allocs,
                    (string) $fr['stock_lot_id'],
                    (string) $fr['basis_segment_id'],
                    BcMath::str($fr['offset_quantity'] ?? '0'),
                    BcMath::str($fr['quantity']),
                    'reallocated'
                );

                if (! $matched) {
                    throw new ContractException(409, 'reservation_conflict', 'from_ranges not owned by active reservation.', [
                        'failed_intent_committed' => false,
                        'current' => ['reservation' => $this->formatReservation($reservation)],
                    ]);
                }
            }

            // Recheck free ranges after releasing only the selected coordinates.
            foreach ($toTargets as $target) {
                $lotId = (string) $target['stock_lot_id'];
                /** @var InventoryLot|null $lot */
                $lot = $lots->get($lotId);
                if (! $lot) {
                    throw new ContractException(404, 'resource_not_found', "Target stock lot {$lotId} not found.", [
                        'failed_intent_committed' => false,
                        'current' => ['reservation' => $this->formatReservation($reservation)],
                    ]);
                }

                $this->assertLotTargetAvailable($lot, $target, $rf, $rfLine, $currentReservation);
            }

            foreach ($toTargets as $tt) {
                RfReservationAllocation::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $chapterId,
                    'reservation_id' => $reservation->id,
                    'lot_id' => $tt['stock_lot_id'],
                    'basis_segment_id' => $tt['basis_segment_id'],
                    'offset_quantity' => BcMath::str($tt['offset_quantity']),
                    'quantity' => BcMath::str($tt['quantity']),
                    'consumed_quantity' => BcMath::str('0'),
                    'released_quantity' => BcMath::str('0'),
                    'status' => 'active',
                ]);
            }

            $reservation->lot_id = $toTargets[0]['stock_lot_id'] ?? $reservation->lot_id;
            $reservation->version += 1;
            $reservation->material_version += 1;
            $reservation->unsetRelation('allocations');
            $this->syncReservationStateAndBlocked($reservation);
            $reservation->save();

            $operationId = (string) Str::uuid();
            $this->demandParticipant->execute([
                'actor_id' => $actorId,
                'chapter_id' => $chapterId,
                'operation_id' => $operationId,
                'change' => 'reallocate',
                'rf_id' => $rf->id,
                'rf_line_id' => $reservation->rf_line_id ?? $reservation->source_line_id,
                'expected_rf_version' => (int) $rf->version,
                'expected_rf_material_version' => (int) $rf->material_version,
                'expected_rf_progress_version' => (int) $rf->progress_version,
                'quantity' => $toSum,
            ]);

            $this->invalidatePreparedBatchesForReservation($chapterId, $rf->id, $reservation->id, $actorId, 'Reservation reallocated');

            $freshRes = $reservation->fresh('allocations');
            $formattedRes = $this->formatReservation($freshRes);
            $this->recordReservationHistory($freshRes, 'reallocated', $actorId, $reason, $formattedRes);

            $freshRf = $rf->fresh('lines');
            $this->recordRfProgressVersion($freshRf, 'reservation_reallocated', $actorId, $reason);

            $this->outbox->recordIntent('stage1.rf-reservation.changed.v1', $chapterId, $freshRes->id, $freshRes->version, $freshRes->material_version);
            $this->outbox->recordIntent('stage1.internal-rf.changed.v1', $chapterId, $freshRf->id, $freshRf->version, $freshRf->material_version);

            return $this->operationEnvelope(
                $chapterId,
                $actorId,
                'reallocateRfReservation',
                $actionKey,
                'reservation',
                $freshRes->id,
                200,
                $formattedRes,
                $input,
                $operationId
            );
        });
    }

    public function placeHold(string $chapterId, string $actorId, array $input, ?string $actionKey = null): array
    {
        $targets = $input['targets'] ?? [];
        $reasonCode = (string) ($input['reason_code'] ?? '');
        $reason = trim((string) ($input['reason'] ?? ''));

        if (empty($targets) || $reason === '' || ! in_array($reasonCode, ['damage_review', 'safety_review', 'source_dispute', 'count_discrepancy'], true)) {
            throw new ContractException(422, 'invalid_input', 'targets, valid reason_code, and reason are required.');
        }

        BcMath::assertDisjointIntervals($targets);

        return DB::transaction(function () use ($chapterId, $actorId, $input, $targets, $reasonCode, $reason, $actionKey) {
            $lotIds = collect($targets)->pluck('stock_lot_id')->unique()->sort()->values()->all();
            $lots = InventoryLot::where('chapter_id', $chapterId)
                ->whereIn('id', $lotIds)
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            foreach ($targets as $target) {
                $lotId = (string) $target['stock_lot_id'];
                /** @var InventoryLot|null $lot */
                $lot = $lots->get($lotId);
                if (! $lot) {
                    throw new ContractException(404, 'resource_not_found', "Stock lot {$lotId} not found.", [
                        'failed_intent_committed' => false,
                    ]);
                }

                if (isset($target['expected_lot_material_version']) && (int) $target['expected_lot_material_version'] !== (int) $lot->material_version) {
                    throw new ContractException(409, 'material_version_conflict', 'Lot material_version mismatch.', [
                        'failed_intent_committed' => false,
                    ]);
                }
                if (isset($target['expected_stock_version']) && (int) $target['expected_stock_version'] !== (int) $lot->stock_version) {
                    throw new ContractException(409, 'version_conflict', 'Lot stock_version mismatch.', [
                        'failed_intent_committed' => false,
                    ]);
                }

                $offset = BcMath::str($target['offset_quantity'] ?? '0');
                $qty = BcMath::str($target['quantity'] ?? '0');
                if (BcMath::comp($qty, '0') <= 0) {
                    throw new ContractException(422, 'invalid_input', 'Hold target quantity must be positive.');
                }

                // Verify requested hold range lies within basis bounds [0, quantity_received)
                // and does not overlap any already-consumed coordinates
                $consumedData = $this->stockViewQuery->getConsumedIntervalsForLot($lot);
                $end = BcMath::add($offset, $qty);
                if (BcMath::comp($end, $consumedData['basis_total']) > 0) {
                    throw new ContractException(409, 'already_consumed', 'Requested hold range exceeds accepted lot basis bounds.', [
                        'failed_intent_committed' => false,
                    ]);
                }
                foreach ($consumedData['consumed_intervals'] as $ci) {
                    if (BcMath::intervalsOverlap($offset, $qty, $ci['offset'], $ci['quantity'])) {
                        throw new ContractException(409, 'already_consumed', 'Requested hold range overlaps already-consumed lot coordinates.', [
                            'failed_intent_committed' => false,
                        ]);
                    }
                }
            }

            $hold = StockHold::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $chapterId,
                'status' => 'active',
                'version' => 1,
                'material_version' => 1,
                'reason_code' => $reasonCode,
                'reason' => $reason,
                'placed_by_user_id' => $actorId,
                'placed_at' => now(),
            ]);

            foreach ($targets as $target) {
                StockHoldRange::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $chapterId,
                    'hold_id' => $hold->id,
                    'lot_id' => $target['stock_lot_id'],
                    'basis_segment_id' => $target['basis_segment_id'],
                    'offset_quantity' => BcMath::str($target['offset_quantity']),
                    'quantity' => BcMath::str($target['quantity']),
                ]);
            }

            $hold->load('ranges');
            $formattedHold = $this->formatHold($hold);
            $this->recordHoldHistory($hold, 'placed', $actorId, $formattedHold);

            $this->recomputeBlockedStateForLots($chapterId, $lotIds, $actorId);
            $this->outbox->recordIntent('stage1.stock-hold.changed.v1', $chapterId, $hold->id, $hold->version, $hold->material_version);

            return $this->operationEnvelope(
                $chapterId,
                $actorId,
                'placeStockHold',
                $actionKey,
                'hold',
                $hold->id,
                201,
                $formattedHold,
                $input
            );
        });
    }

    public function proposeHoldClearance(string $chapterId, string $holdId, string $actorId, array $input, ?string $actionKey = null): array
    {
        $resolution = trim((string) ($input['resolution'] ?? ''));
        $signatories = $input['signatories'] ?? [];
        if ($resolution === '' || empty($signatories)) {
            throw new ContractException(422, 'invalid_input', 'resolution and signatories are required.');
        }

        return DB::transaction(function () use ($chapterId, $holdId, $actorId, $input, $resolution, $signatories, $actionKey) {
            $hold = StockHold::where('chapter_id', $chapterId)->where('id', $holdId)->with('ranges')->lockForUpdate()->first();
            if (! $hold) {
                throw new ContractException(404, 'resource_not_found', "Stock hold {$holdId} not found.");
            }
            if ($hold->status !== 'active') {
                throw new ContractException(409, 'state_conflict', 'Hold is already cleared.', [
                    'failed_intent_committed' => false,
                    'current' => ['hold' => $this->formatHold($hold)],
                ]);
            }

            if (isset($input['expected_version']) && (int) $input['expected_version'] !== (int) $hold->version) {
                throw new ContractException(409, 'version_conflict', 'version conflict', [
                    'failed_intent_committed' => false,
                    'current' => ['hold' => $this->formatHold($hold)],
                ]);
            }
            if (isset($input['expected_material_version']) && (int) $input['expected_material_version'] !== (int) $hold->material_version) {
                throw new ContractException(409, 'material_version_conflict', 'material version conflict', [
                    'failed_intent_committed' => false,
                    'current' => ['hold' => $this->formatHold($hold)],
                ]);
            }

            $nextMaterialVersion = $hold->material_version + 1;
            $materialPayload = [
                'chapter_id' => $chapterId,
                'hold_id' => $hold->id,
                'material_version' => $nextMaterialVersion,
                'ranges' => $hold->ranges->map(fn (StockHoldRange $r) => [
                    'stock_lot_id' => $r->lot_id,
                    'basis_segment_id' => $r->basis_segment_id,
                    'offset_quantity' => BcMath::format($r->offset_quantity),
                    'quantity' => BcMath::format($r->quantity),
                ])->values()->all(),
                'resolution' => $resolution,
                'condition_treatment_source_id' => $input['condition_treatment_source_id'] ?? null,
                'signatories' => $signatories,
                'prepared_by_user_id' => $actorId,
            ];

            $sha256 = CanonicalJson::sha256($materialPayload);

            $hold->clearance_proposal_json = $materialPayload;
            $hold->clearance_material_sha256 = $sha256;
            $hold->clearance_prepared_by_user_id = $actorId;
            $hold->version += 1;
            $hold->material_version = $nextMaterialVersion;
            $hold->save();

            $formattedHold = $this->formatHold($hold->fresh('ranges'));
            $this->recordHoldHistory($hold, 'clearance_proposed', $actorId, $formattedHold);
            $this->outbox->recordIntent('stage1.stock-hold.changed.v1', $chapterId, $hold->id, $hold->version, $hold->material_version);

            return $this->operationEnvelope(
                $chapterId,
                $actorId,
                'proposeStockHoldClearance',
                $actionKey,
                'hold',
                $hold->id,
                200,
                $formattedHold,
                $input
            );
        });
    }

    public function clearHold(string $chapterId, string $holdId, string $actorId, array $input, ?string $actionKey = null): array
    {
        return DB::transaction(function () use ($chapterId, $holdId, $actorId, $input, $actionKey) {
            $hold = StockHold::where('chapter_id', $chapterId)->where('id', $holdId)->with('ranges')->lockForUpdate()->first();
            if (! $hold) {
                throw new ContractException(404, 'resource_not_found', "Stock hold {$holdId} not found.");
            }
            if ($hold->status !== 'active') {
                throw new ContractException(409, 'state_conflict', 'Hold is already cleared.', [
                    'failed_intent_committed' => false,
                    'current' => ['hold' => $this->formatHold($hold)],
                ]);
            }
            if (! $hold->clearance_proposal_json || ! $hold->clearance_material_sha256) {
                throw new ContractException(409, 'clearance_proposal_required', 'Clearance proposal must be recorded before clearing hold.', [
                    'failed_intent_committed' => false,
                    'current' => ['hold' => $this->formatHold($hold)],
                ]);
            }

            if ($hold->clearance_prepared_by_user_id && $hold->clearance_prepared_by_user_id !== $actorId) {
                throw new ContractException(403, 'duty_denied', 'Only the original clearance proposal preparer may clear this hold.');
            }

            if (isset($input['expected_version']) && (int) $input['expected_version'] !== (int) $hold->version) {
                throw new ContractException(409, 'version_conflict', 'version conflict', [
                    'failed_intent_committed' => false,
                    'current' => ['hold' => $this->formatHold($hold)],
                ]);
            }
            if (isset($input['expected_material_version']) && (int) $input['expected_material_version'] !== (int) $hold->material_version) {
                throw new ContractException(409, 'material_version_conflict', 'material version conflict', [
                    'failed_intent_committed' => false,
                    'current' => ['hold' => $this->formatHold($hold)],
                ]);
            }

            $expectedSnapshot = $input['expected_snapshot'] ?? [];
            $snapSha = $expectedSnapshot['sha256'] ?? null;
            $snapMatVer = $expectedSnapshot['material_version'] ?? null;

            if ($snapSha !== $hold->clearance_material_sha256 || (int) $snapMatVer !== (int) $hold->material_version) {
                throw new ContractException(409, 'material_version_conflict', 'material version conflict', [
                    'failed_intent_committed' => false,
                    'current' => ['hold' => $this->formatHold($hold)],
                ]);
            }

            if (($input['matches_paper'] ?? false) !== true) {
                throw new ContractException(422, 'invalid_input', 'matches_paper must be true.');
            }

            $evidenceInput = $input['evidence'] ?? [];
            if (! is_array($evidenceInput)) {
                throw new ContractException(422, 'invalid_input', 'Supply an evidence binding object.');
            }
            if (array_key_exists('version_id', $evidenceInput)) {
                $snapshot = [
                    'target' => ['purpose' => 'hold_clearance', 'record_id' => $hold->id],
                    'material_version' => $hold->material_version,
                    'sha256' => $hold->clearance_material_sha256,
                ];
                $current = ['hold' => $this->formatHold($hold), 'rf' => null, 'preparation' => null, 'reservation' => null, 'review' => null];
                if (CanonicalJson::encode($expectedSnapshot) !== CanonicalJson::encode($snapshot)) {
                    throw new ContractException(409, 'material_version_conflict', 'The clearance snapshot has changed.', [
                        'failed_intent_committed' => false, 'current' => $current, 'setup_blockers' => [],
                    ]);
                }
                $signedAt = collect($hold->clearance_proposal_json['signatories'] ?? [])->max('signed_at');
                $signed = is_string($signedAt) && preg_match('/\A[0-9T:.Z-]{27}\z/', $signedAt)
                    ? \DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s.u\Z', $signedAt, new \DateTimeZone('UTC'))
                    : false;
                if (! $signed || $signed->format('Y-m-d\TH:i:s.u\Z') !== $signedAt || $signedAt > now('UTC')->toISOString()) {
                    throw new ContractException(409, 'evidence_mismatch', 'The clearance signatories are required.', [
                        'failed_intent_committed' => false, 'current' => $current, 'setup_blockers' => [],
                    ]);
                }
                $binding = $this->checkEvidenceBinding->recordMatch(
                    $chapterId, $actorId, $snapshot, $evidenceInput, null, $actorId, $signedAt, $current,
                );
                $check = ['acknowledgment_id' => $binding->id];
            } else {
                $check = $this->checkLegacyClearance($chapterId, $hold, $actorId, $evidenceInput);
            }

            $hold->status = 'cleared';
            $hold->cleared_by_user_id = $actorId;
            $hold->cleared_at = now();
            $hold->clearance_evidence_binding_id = $check['acknowledgment_id'] ?? null;
            $hold->clearance_acknowledgment_json = $binding->match_projection ?? [
                'acknowledgment_id' => $check['acknowledgment_id'] ?? null,
                'matched_by_user_id' => $actorId,
                'matched_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'evidence' => $evidenceInput,
            ];
            $hold->version += 1;
            $hold->save();

            $formattedHold = $this->formatHold($hold->fresh('ranges'));
            $this->recordHoldHistory($hold, 'cleared', $actorId, $formattedHold);

            $lotIds = $hold->ranges->pluck('lot_id')->unique()->values()->all();
            $rfChanges = $this->recomputeBlockedStateForLots($chapterId, $lotIds, $actorId);
            $this->outbox->recordIntent('stage1.stock-hold.changed.v1', $chapterId, $hold->id, $hold->version, $hold->material_version);

            return $this->operationEnvelope(
                $chapterId,
                $actorId,
                'clearStockHold',
                $actionKey,
                'hold',
                $hold->id,
                200,
                $formattedHold,
                $input,
                rfChanges: isset($binding) ? $rfChanges : null,
            );
        });
    }

    private function checkLegacyClearance(string $chapterId, StockHold $hold, string $actorId, array $evidenceInput): array
    {
        $evidenceId = $evidenceInput['evidence_id'] ?? null;
        $bindingLines = $hold->ranges->map(fn (StockHoldRange $r) => [
            'variant_id' => $r->lot_id,
            'unit_id' => $r->basis_segment_id,
            'quantity' => $r->quantity,
        ])->values()->all();

        try {
            $check = $this->checkEvidenceBinding->check([
                'chapter_id' => $chapterId,
                'evidence_id' => $evidenceId,
                'binding_id' => $evidenceInput['binding_id'] ?? null,
                'source_type' => 'hold_clearance',
                'source_id' => $hold->id,
                'recipient_name' => $hold->clearance_prepared_by_user_id ?? $actorId,
                'lines' => $bindingLines,
            ], strict: true);
        } catch (DomainException $e) {
            throw new ContractException(409, 'evidence_mismatch', $e->getMessage(), [
                'failed_intent_committed' => false,
                'current' => ['hold' => $this->formatHold($hold)],
            ]);
        }

        return $check;
    }

    public function recomputeBlockedStateForLots(string $chapterId, array $lotIds, ?string $actorId = null): array
    {
        if (empty($lotIds)) {
            return [];
        }

        $affectedResIds = RfReservationAllocation::where('chapter_id', $chapterId)
            ->whereIn('lot_id', $lotIds)
            ->where('status', 'active')
            ->pluck('reservation_id')
            ->unique()
            ->values()
            ->all();

        if (empty($affectedResIds)) {
            return [];
        }

        $reservations = StockReservation::whereIn('id', $affectedResIds)
            ->where('status', 'ACTIVE')
            ->with('allocations')
            ->lockForUpdate()
            ->get();

        $affectedRfLines = [];
        foreach ($reservations as $res) {
            $oldBlocked = BcMath::str($res->blocked_quantity);
            $this->syncReservationStateAndBlocked($res);
            $newBlocked = BcMath::str($res->blocked_quantity);

            if (BcMath::comp($oldBlocked, $newBlocked) !== 0) {
                $res->version += 1;
                $res->save();
                $this->recordReservationHistory($res, 'hold_state_changed', $actorId ?? 'system', null, $this->formatReservation($res));
                $this->outbox->recordIntent('stage1.rf-reservation.changed.v1', $chapterId, $res->id, $res->version, $res->material_version);
            }

            if ($res->rf_line_id) {
                $affectedRfLines[$res->source_id][] = $res->rf_line_id;
            }
        }

        $rfChanges = [];
        foreach ($affectedRfLines as $rfId => $lineIds) {
            $rf = InternalRf::where('id', $rfId)->lockForUpdate()->first();
            if (! $rf) {
                continue;
            }
            $changed = false;
            foreach (array_unique($lineIds) as $lineId) {
                $line = InternalRfLine::where('id', $lineId)->lockForUpdate()->first();
                if (! $line) {
                    continue;
                }
                $newLineBlocked = $this->demandParticipant->computeBlockedForLine($chapterId, $line->id);
                if (BcMath::comp($line->blocked_reserved_quantity, $newLineBlocked) !== 0) {
                    $line->blocked_reserved_quantity = $newLineBlocked;
                    $line->save();
                    $changed = true;
                }
            }
            if ($changed) {
                $rf->version += 1;
                $rf->progress_version += 1;
                $rf->save();
                $rfChanges[] = ['rf_id' => $rf->id, 'version' => (int) $rf->version, 'progress_version' => (int) $rf->progress_version];
                $this->recordRfProgressVersion($rf->fresh('lines'), 'hold_state_changed', $actorId ?? 'system', null);
                $this->outbox->recordIntent('stage1.internal-rf.changed.v1', $chapterId, $rf->id, $rf->version, $rf->material_version);
            }
        }

        return $rfChanges;
    }

    public function syncReservationStateAndBlocked(StockReservation $reservation): void
    {
        $reservation->loadMissing('allocations');
        $activeQty = BcMath::str($reservation->active_quantity ?? $reservation->quantity);
        $fulfilledQty = BcMath::str($reservation->fulfilled_quantity);
        $releasedQty = BcMath::str($reservation->released_quantity);

        $activeAllocs = $reservation->allocations->where('status', 'active');
        $blocked = BcMath::str('0');

        if ($activeAllocs->isNotEmpty() && BcMath::isPositive($activeQty)) {
            $lotIds = $activeAllocs->pluck('lot_id')->unique()->values()->all();
            $holds = StockHold::where('chapter_id', $reservation->chapter_id)
                ->where('status', 'active')
                ->whereHas('ranges', fn ($q) => $q->whereIn('lot_id', $lotIds))
                ->with(['ranges' => fn ($q) => $q->whereIn('lot_id', $lotIds)])
                ->get();

            $holdByLot = [];
            foreach ($holds as $hold) {
                foreach ($hold->ranges as $r) {
                    $holdByLot[$r->lot_id][] = [
                        'offset' => BcMath::str($r->offset_quantity),
                        'quantity' => BcMath::str($r->quantity),
                    ];
                }
            }

            $allocByLot = [];
            foreach ($activeAllocs as $a) {
                $rem = BcMath::sub($a->quantity, BcMath::add($a->consumed_quantity, $a->released_quantity));
                if (BcMath::comp($rem, '0') > 0) {
                    $allocByLot[$a->lot_id][] = [
                        'offset' => BcMath::str($a->offset_quantity),
                        'quantity' => $rem,
                    ];
                }
            }

            foreach ($allocByLot as $lotId => $aIntervals) {
                $hIntervals = $holdByLot[$lotId] ?? [];
                if (! empty($hIntervals)) {
                    $intersections = BcMath::intersectIntervalLists($aIntervals, $hIntervals);
                    $blocked = BcMath::add($blocked, BcMath::intervalUnionLength($intersections));
                }
            }
        }

        if (BcMath::comp($blocked, $activeQty) > 0) {
            $blocked = $activeQty;
        }
        $reservation->blocked_quantity = $blocked;
        $reservation->quantity = $activeQty;

        if (BcMath::isZero($activeQty)) {
            $hasFulfilled = BcMath::isPositive($fulfilledQty);
            $hasReleased = BcMath::isPositive($releasedQty);
            if ($hasFulfilled && $hasReleased) {
                $reservation->state = 'closed_mixed';
                $reservation->status = 'CONSUMED';
            } elseif ($hasFulfilled) {
                $reservation->state = 'fulfilled';
                $reservation->status = 'CONSUMED';
            } else {
                $reservation->state = 'released';
                $reservation->status = 'RELEASED';
            }
        } else {
            $reservation->status = 'ACTIVE';
            if (BcMath::isZero($blocked)) {
                $reservation->state = 'active';
            } elseif (BcMath::comp($blocked, $activeQty) === 0) {
                $reservation->state = 'blocked';
            } else {
                $reservation->state = 'partially_blocked';
            }
        }
    }

    public function formatPreparation(RfReservationPreparation $prep): array
    {
        return [
            'id' => $prep->id,
            'chapter_id' => $prep->chapter_id,
            'rf_id' => $prep->rf_id,
            'rf_line_id' => $prep->rf_line_id,
            'version' => (int) $prep->version,
            'status' => $prep->status,
            'prepared_by' => [
                'user_id' => $prep->actor_user_id,
                'chapter_id' => $prep->chapter_id,
            ],
            'expected_rf_version' => (int) $prep->expected_rf_version,
            'expected_rf_material_version' => (int) $prep->expected_rf_material_version,
            'expected_rf_progress_version' => (int) $prep->expected_rf_progress_version,
            'targets' => $prep->targets_json ?? [],
            'advisory_review' => $prep->advisory_review_json,
            'override_policy_id' => $prep->override_policy_id,
            'committed_reservation_id' => $prep->committed_reservation_id,
            'observed_at' => $prep->observed_at?->format('Y-m-d\TH:i:s.u\Z'),
        ];
    }

    public function formatReservation(StockReservation $res): array
    {
        $res->loadMissing(['allocations', 'rf', 'rfLine']);
        $rfLine = $res->rfLine;
        $rf = $res->rf;
        $scale = (int) ($rfLine?->identity_at_approval['quantity_scale'] ?? 0);

        $activeAllocs = $res->allocations->where('status', 'active')->map(function (RfReservationAllocation $a) use ($scale): array {
            $rem = BcMath::sub($a->quantity, BcMath::add($a->consumed_quantity, $a->released_quantity));

            return [
                'stock_lot_id' => $a->lot_id,
                'basis_segment_id' => $a->basis_segment_id,
                'offset_quantity' => BcMath::format($a->offset_quantity, $scale),
                'quantity' => BcMath::format($rem, $scale),
            ];
        })->filter(fn (array $x) => BcMath::isPositive($x['quantity']))->values()->all();

        $lotIds = collect($activeAllocs)->pluck('stock_lot_id')->unique()->values()->all();
        $activeHoldIds = [];
        if (! empty($lotIds)) {
            $holds = StockHold::where('chapter_id', $res->chapter_id)
                ->where('status', 'active')
                ->whereHas('ranges', fn ($q) => $q->whereIn('lot_id', $lotIds))
                ->with(['ranges' => fn ($q) => $q->whereIn('lot_id', $lotIds)])
                ->get();

            foreach ($holds as $h) {
                foreach ($h->ranges as $hr) {
                    foreach ($activeAllocs as $al) {
                        if ($al['stock_lot_id'] === $hr->lot_id && BcMath::intervalsOverlap($al['offset_quantity'], $al['quantity'], $hr->offset_quantity, $hr->quantity)) {
                            $activeHoldIds[] = $h->id;
                        }
                    }
                }
            }
        }

        $demand = null;
        if ($rfLine) {
            $approved = BcMath::str($rfLine->approved_quantity);
            $issued = BcMath::str($rfLine->issued_quantity);
            $reserved = BcMath::str($rfLine->reserved_quantity);
            $blocked = BcMath::str($rfLine->blocked_reserved_quantity);
            $canceled = BcMath::str($rfLine->canceled_quantity);
            $remaining = BcMath::sub(BcMath::sub($approved, $issued), $canceled);
            $unreserved = BcMath::sub($remaining, $reserved);

            $demand = [
                'approved_quantity' => BcMath::format($approved, $scale),
                'issued_quantity' => BcMath::format($issued, $scale),
                'reserved_quantity' => BcMath::format($reserved, $scale),
                'blocked_reserved_quantity' => BcMath::format($blocked, $scale),
                'canceled_quantity' => BcMath::format($canceled, $scale),
                'remaining_quantity' => BcMath::format($remaining, $scale),
                'unreserved_quantity' => BcMath::format($unreserved, $scale),
            ];
        }

        return [
            'id' => $res->id,
            'chapter_id' => $res->chapter_id,
            'rf_id' => $res->source_id,
            'rf_line_id' => $res->rf_line_id ?? $res->source_line_id,
            'version' => (int) ($res->version ?? 1),
            'material_version' => (int) ($res->material_version ?? 1),
            'approved_rf_material_version' => (int) ($rf?->approved_material_version ?? $rf?->material_version ?? 1),
            'variant_id' => $rfLine?->variant_id,
            'unit_id' => $rfLine?->unit_id,
            'quantity_scale' => $scale,
            'status' => $res->state ?? 'active',
            'committed_quantity' => BcMath::format($res->committed_quantity ?? $res->quantity, $scale),
            'active_quantity' => BcMath::format($res->active_quantity ?? $res->quantity, $scale),
            'blocked_quantity' => BcMath::format($res->blocked_quantity ?? 0, $scale),
            'fulfilled_quantity' => BcMath::format($res->fulfilled_quantity ?? 0, $scale),
            'released_quantity' => BcMath::format($res->released_quantity ?? 0, $scale),
            'allocations' => $activeAllocs,
            'active_hold_ids' => array_values(array_unique($activeHoldIds)),
            'created_by' => [
                'user_id' => $res->created_by_user_id ?? 'system-user',
                'chapter_id' => $res->chapter_id,
            ],
            'created_at' => $res->created_at?->format('Y-m-d\TH:i:s.u\Z'),
            'updated_at' => $res->updated_at?->format('Y-m-d\TH:i:s.u\Z'),
            'expires_at' => null,
            'rf_version' => (int) ($rf?->version ?? 1),
            'rf_progress_version' => (int) ($rf?->progress_version ?? 1),
            'demand' => $demand,
        ];
    }

    public function formatHold(StockHold $hold): array
    {
        $hold->loadMissing('ranges');

        $clearanceProposal = $hold->clearance_proposal_json
            ? [
                'resolution' => $hold->clearance_proposal_json['resolution'] ?? null,
                'condition_treatment_source_id' => $hold->clearance_proposal_json['condition_treatment_source_id'] ?? null,
                'signatories' => $hold->clearance_proposal_json['signatories'] ?? [],
                'prepared_by' => [
                    'user_id' => $hold->clearance_prepared_by_user_id,
                    'chapter_id' => $hold->chapter_id,
                ],
                'material_sha256' => $hold->clearance_material_sha256,
                'material_version' => (int) $hold->material_version,
            ]
            : null;

        $clearance = $hold->status === 'cleared'
            ? [
                'cleared_by' => [
                    'user_id' => $hold->cleared_by_user_id,
                    'chapter_id' => $hold->chapter_id,
                ],
                'cleared_at' => $hold->cleared_at?->format('Y-m-d\TH:i:s.u\Z'),
                'resolution' => $clearanceProposal['resolution'],
                'condition_treatment_source_id' => $clearanceProposal['condition_treatment_source_id'],
                'acknowledgment' => $hold->clearance_acknowledgment_json,
            ]
            : null;

        return [
            'id' => $hold->id,
            'chapter_id' => $hold->chapter_id,
            'version' => (int) $hold->version,
            'material_version' => (int) $hold->material_version,
            'status' => $hold->status,
            'ranges' => $hold->ranges->map(fn (StockHoldRange $r) => [
                'stock_lot_id' => $r->lot_id,
                'basis_segment_id' => $r->basis_segment_id,
                'offset_quantity' => BcMath::format($r->offset_quantity),
                'quantity' => BcMath::format($r->quantity),
            ])->values()->all(),
            'reason_code' => $hold->reason_code,
            'reason' => $hold->reason,
            'placed_by' => [
                'user_id' => $hold->placed_by_user_id,
                'chapter_id' => $hold->chapter_id,
            ],
            'placed_at' => $hold->placed_at?->format('Y-m-d\TH:i:s.u\Z'),
            'clearance_proposal' => $clearanceProposal,
            'clearance' => $clearance,
        ];
    }

    private function assertLotTargetAvailable(
        InventoryLot $lot,
        array $target,
        InternalRf $rf,
        InternalRfLine $rfLine,
        ?array $currentReservation = null,
    ): void {
        $conflict = fn (string $code, string $message) => new ContractException(409, $code, $message, [
            'failed_intent_committed' => false,
            'setup_blockers' => [],
            'current' => [
                'rf' => null,
                'preparation' => null,
                'reservation' => $currentReservation,
                'hold' => null,
                'review' => null,
            ],
        ]);

        if ($lot->chapter_id !== $rf->chapter_id || $lot->variant_id !== $rfLine->variant_id
            || $lot->unit_id !== $rfLine->unit_id || strtoupper($lot->condition) !== 'USABLE' || strtoupper($lot->custody) !== 'STOCKROOM') {
            throw $conflict('availability_conflict', 'Stock lot does not match the approved RF line and usable stockroom scope.');
        }
        if (isset($target['expected_lot_material_version']) && (int) $target['expected_lot_material_version'] !== (int) $lot->material_version) {
            throw $conflict('material_version_conflict', 'Lot material version changed.');
        }
        if (isset($target['expected_stock_version']) && (int) $target['expected_stock_version'] !== (int) $lot->stock_version) {
            throw $conflict('availability_conflict', 'Lot stock version changed.');
        }

        $offset = BcMath::str($target['offset_quantity']);
        $quantity = BcMath::str($target['quantity']);
        $eligibility = app(StockEligibilityEvaluator::class);
        $segment = collect($eligibility->segments($lot))->first(fn (array $segment): bool => $segment['basis_segment_id'] === $target['basis_segment_id']
            && BcMath::intervalContains($segment['offset'], $segment['quantity'], $offset, $quantity));
        if ($segment === null || ! BcMath::isPositive($quantity)) {
            throw $conflict('availability_conflict', 'The named basis segment does not contain the requested range.');
        }

        $state = $eligibility->restrictionState(
            $lot, $segment['restrictions'], $lot->restrictions()->exists(), $rf->purpose, now('UTC'), $rf,
        );
        if (! in_array($state, ['unrestricted', 'bounded'], true)) {
            throw $conflict('restriction_unsupported', 'Donor conditions do not permit this range for the RF.');
        }

        $consumed = $this->stockViewQuery->getConsumedIntervalsForLot($lot)['consumed_intervals'];
        $holds = $this->stockViewQuery->getActiveHoldRangesForLot($rf->chapter_id, $lot->id);
        $reservations = $this->stockViewQuery->getActiveReservationRangesForLot($rf->chapter_id, $lot->id);
        foreach ([...$consumed, ...$holds, ...$reservations] as $blocked) {
            if (BcMath::intervalsOverlap($offset, $quantity, $blocked['offset'], $blocked['quantity'])) {
                throw $conflict('availability_conflict', 'The requested range overlaps held, reserved or consumed stock.');
            }
        }
    }

    private function assertReservationVersions(StockReservation $res, InternalRf $rf, array $input): void
    {
        if (isset($input['expected_version']) && (int) $input['expected_version'] !== (int) $res->version) {
            throw new ContractException(409, 'version_conflict', 'Reservation version mismatch.', [
                'failed_intent_committed' => false,
                'current' => ['reservation' => $this->formatReservation($res)],
            ]);
        }
        if (isset($input['expected_material_version']) && (int) $input['expected_material_version'] !== (int) $res->material_version) {
            throw new ContractException(409, 'material_version_conflict', 'Reservation material_version mismatch.', [
                'failed_intent_committed' => false,
                'current' => ['reservation' => $this->formatReservation($res)],
            ]);
        }
        if (isset($input['expected_rf_version']) && (int) $input['expected_rf_version'] !== (int) $rf->version) {
            throw new ContractException(409, 'version_conflict', 'RF version mismatch.', [
                'failed_intent_committed' => false,
                'current' => ['rf' => $this->rfService->formatRf($rf)],
            ]);
        }
        if (isset($input['expected_rf_material_version']) && (int) $input['expected_rf_material_version'] !== (int) $rf->material_version) {
            throw new ContractException(409, 'material_version_conflict', 'RF material_version mismatch.', [
                'failed_intent_committed' => false,
                'current' => ['rf' => $this->rfService->formatRf($rf)],
            ]);
        }
        if (isset($input['expected_rf_progress_version']) && (int) $input['expected_rf_progress_version'] !== (int) $rf->progress_version) {
            throw new ContractException(409, 'progress_version_conflict', 'RF progress_version mismatch.', [
                'failed_intent_committed' => false,
                'current' => ['rf' => $this->rfService->formatRf($rf)],
            ]);
        }
    }

    private function assertNoUnresolvedHandoverForReservation(string $chapterId, string $rfId, string $reservationId): void
    {
        $unresolvedIssue = ActualIssue::where('chapter_id', $chapterId)
            ->where('requisition_id', $rfId)
            ->where('handover_fence', 'unresolved')
            ->whereHas('lines', fn ($q) => $q->where('reservation_id', $reservationId))
            ->exists();

        if ($unresolvedIssue) {
            throw new ContractException(409, 'handover_unresolved', 'Cannot release or reallocate while an unresolved handover exists.', [
                'failed_intent_committed' => false,
            ]);
        }

        $unresolvedHandover = Handover::where('chapter_id', $chapterId)
            ->where('source_type', 'REQUISITION')
            ->where('source_id', $rfId)
            ->where('status', 'DRAFT')
            ->exists();

        if ($unresolvedHandover) {
            throw new ContractException(409, 'handover_unresolved', 'Cannot release or reallocate while an unresolved handover exists.', [
                'failed_intent_committed' => false,
            ]);
        }
    }

    private function invalidatePreparedBatchesForReservation(string $chapterId, string $rfId, string $reservationId, string $actorId, string $reason): void
    {
        $issues = ActualIssue::where('chapter_id', $chapterId)
            ->where('requisition_id', $rfId)
            ->whereIn('status', ['prepared', 'acknowledged'])
            ->whereHas('lines', fn ($q) => $q->where('reservation_id', $reservationId))
            ->lockForUpdate()
            ->get();

        foreach ($issues as $issue) {
            if ($issue->evidence_binding_id) {
                EvidenceBinding::where('id', $issue->evidence_binding_id)
                    ->update(['status' => 'invalidated']);
            }
            $issue->status = 'invalidated';
            $issue->evidence_binding_id = null;
            $issue->version += 1;
            $issue->material_version += 1;
            $issue->save();

            ActualIssueHistory::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $chapterId,
                'actual_issue_id' => $issue->id,
                'version' => $issue->version,
                'material_version' => $issue->material_version,
                'event_type' => 'invalidated',
                'actor_user_id' => $actorId,
                'reason' => $reason,
                'snapshot_json' => $issue->toArray(),
                'created_at' => now(),
            ]);

            $this->outbox->recordIntent('stage1.actual-issue.changed.v1', $chapterId, $issue->id, $issue->version, $issue->material_version);
        }
    }

    /**
     * Reduce or split an active allocation interval for release, reallocation, or consumption.
     */
    public function consumeOrReleaseAllocationInterval(
        Collection $allocs,
        string $lotId,
        string $basisSegmentId,
        string $offset,
        string $qty,
        string $mode
    ): bool {
        $reqStart = BcMath::str($offset);
        $reqEnd = BcMath::add($reqStart, $qty);

        foreach ($allocs as $alloc) {
            if ($alloc->status !== 'active' || $alloc->lot_id !== $lotId || $alloc->basis_segment_id !== $basisSegmentId) {
                continue;
            }
            $allocRem = BcMath::sub($alloc->quantity, BcMath::add($alloc->consumed_quantity, $alloc->released_quantity));
            if (BcMath::comp($allocRem, '0') <= 0) {
                continue;
            }

            if (BcMath::intervalContains($alloc->offset_quantity, $allocRem, $reqStart, $qty)) {
                $allocStart = BcMath::str($alloc->offset_quantity);
                $allocEnd = BcMath::add($allocStart, $allocRem);

                if (BcMath::comp($reqStart, $allocStart) === 0 && BcMath::comp($reqEnd, $allocEnd) === 0) {
                    // Exact match
                    if ($mode === 'consumed') {
                        $alloc->consumed_quantity = BcMath::add($alloc->consumed_quantity, $qty);
                        $alloc->status = 'consumed';
                    } elseif ($mode === 'reallocated') {
                        $alloc->released_quantity = BcMath::add($alloc->released_quantity, $qty);
                        $alloc->status = 'reallocated';
                    } else {
                        $alloc->released_quantity = BcMath::add($alloc->released_quantity, $qty);
                        $alloc->status = 'released';
                    }
                    $alloc->save();

                    return true;
                }

                // Partial slice from [allocStart, allocEnd)
                if ($mode === 'consumed') {
                    $alloc->consumed_quantity = BcMath::add($alloc->consumed_quantity, $qty);
                } else {
                    $alloc->released_quantity = BcMath::add($alloc->released_quantity, $qty);
                }

                // Shift offset if consuming/releasing from the front of the interval
                if (BcMath::comp($reqStart, $allocStart) === 0) {
                    $alloc->offset_quantity = $reqEnd;
                    $alloc->save();

                    return true;
                }

                // If taking from the tail [reqStart, allocEnd)
                if (BcMath::comp($reqEnd, $allocEnd) === 0) {
                    $alloc->save();

                    return true;
                }

                // Middle split: shrink current to [allocStart, reqStart) and spawn tail [reqEnd, allocEnd)
                $tailQty = BcMath::sub($allocEnd, $reqEnd);
                $alloc->quantity = BcMath::sub($reqStart, $allocStart);
                $alloc->consumed_quantity = BcMath::str('0');
                $alloc->released_quantity = BcMath::str('0');
                $alloc->save();

                RfReservationAllocation::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $alloc->chapter_id,
                    'reservation_id' => $alloc->reservation_id,
                    'lot_id' => $alloc->lot_id,
                    'basis_segment_id' => $alloc->basis_segment_id,
                    'offset_quantity' => $reqEnd,
                    'quantity' => $tailQty,
                    'consumed_quantity' => BcMath::str('0'),
                    'released_quantity' => BcMath::str('0'),
                    'status' => 'active',
                ]);

                return true;
            }
        }

        return false;
    }

    private function recordReservationHistory(StockReservation $res, string $eventType, string $actorId, ?string $reason, array $snapshot): void
    {
        RfReservationHistory::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $res->chapter_id,
            'reservation_id' => $res->id,
            'version' => (int) $res->version,
            'material_version' => (int) $res->material_version,
            'event_type' => $eventType,
            'actor_user_id' => $actorId,
            'reason' => $reason,
            'snapshot_json' => $snapshot,
            'created_at' => now(),
        ]);
    }

    private function recordHoldHistory(StockHold $hold, string $eventType, string $actorId, array $snapshot): void
    {
        StockHoldHistory::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $hold->chapter_id,
            'hold_id' => $hold->id,
            'version' => (int) $hold->version,
            'material_version' => (int) $hold->material_version,
            'event_type' => $eventType,
            'actor_user_id' => $actorId,
            'snapshot_json' => $snapshot,
            'created_at' => now(),
        ]);
    }

    private function recordRfProgressVersion(InternalRf $rf, string $eventType, string $actorId, ?string $reason): void
    {
        InternalRfVersion::create([
            'id' => (string) Str::uuid(),
            'rf_id' => $rf->id,
            'chapter_id' => $rf->chapter_id,
            'version' => (int) $rf->version,
            'material_version' => (int) $rf->material_version,
            'progress_version' => (int) $rf->progress_version,
            'event_type' => $eventType,
            'actor_user_id' => $actorId,
            'reason' => $reason,
            'snapshot_json' => $this->rfService->formatRf($rf),
            'created_at' => now(),
        ]);
    }

    private function operationEnvelope(
        string $chapterId,
        string $actorId,
        string $operationName,
        ?string $actionKey,
        string $resourceKind,
        string $resourceId,
        int $httpStatus,
        array $result,
        array $requestPayload,
        ?string $overrideOperationId = null,
        ?array $rfChanges = null,
    ): array {
        $operationId = $overrideOperationId ?? (string) Str::uuid();
        $effectiveKey = $actionKey ?? (string) Str::uuid();

        $envelope = [
            'data' => [
                'operation_id' => $operationId,
                'chapter_id' => $chapterId,
                'actor_id' => $actorId,
                'operation_name' => $operationName,
                'action_key' => $effectiveKey,
                'resource_kind' => $resourceKind,
                'resource_id' => $resourceId,
                'committed_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                ...($rfChanges !== null ? ['rf_changes' => $rfChanges] : ['http_status' => $httpStatus]),
                'outcome' => 'committed',
                'result' => $result,
            ],
        ];

        if ($actionKey !== null) {
            IdempotencyRecord::create([
                'id' => $operationId,
                'key' => $actionKey,
                'chapter_id' => $chapterId,
                'user_id' => $actorId,
                'operation_name' => $operationName,
                'resource_id' => $resourceId,
                'state' => 'committed',
                'payload_hash' => CanonicalJson::sha256($requestPayload),
                'response_code' => $httpStatus,
                'response_body' => json_encode($envelope),
                'expires_at' => now()->addDays(7),
            ]);
        }

        return $envelope;
    }

    private function sumTargetQuantities(array $targets): string
    {
        $total = BcMath::str('0');
        foreach ($targets as $t) {
            $total = BcMath::add($total, $t['quantity'] ?? '0');
        }

        return BcMath::format($total);
    }
}
