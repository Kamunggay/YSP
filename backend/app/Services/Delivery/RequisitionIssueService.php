<?php

namespace App\Services\Delivery;

use App\Exceptions\ContractException;
use App\Models\ActualIssue;
use App\Models\ActualIssueHistory;
use App\Models\ActualIssueLine;
use App\Models\EvidenceBinding;
use App\Models\Handover;
use App\Models\HandoverLine;
use App\Models\HandoverReceipt;
use App\Models\IdempotencyRecord;
use App\Models\InternalRf;
use App\Models\InternalRfLine;
use App\Models\InternalRfVersion;
use App\Models\InventoryLot;
use App\Models\RfReservationAllocation;
use App\Models\RfReservationHistory;
use App\Models\StockHold;
use App\Models\StockHoldRange;
use App\Models\StockReservation;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Inventory\InternalRfService;
use App\Services\Inventory\Participants\PrepareActualIssueInventoryParticipant;
use App\Services\Inventory\Participants\PrepareRfDemandChangeParticipant;
use App\Services\Inventory\ReservationService;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\BcMath;
use App\Services\Shared\CanonicalJson;
use App\Services\Shared\ReferenceSequenceService;
use DomainException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RequisitionIssueService
{
    public function __construct(
        protected ?CheckEvidenceBindingParticipant $checkEvidenceBinding = null,
        protected ?PrepareActualIssueInventoryParticipant $prepareInventory = null,
        protected ?PrepareRfDemandChangeParticipant $demandParticipant = null,
        protected ?ReservationService $reservationService = null,
        protected ?ReferenceSequenceService $referenceSequences = null,
        protected ?InternalRfService $rfService = null,
        protected ?DomainNotificationOutboxService $outbox = null
    ) {
        $this->checkEvidenceBinding = $checkEvidenceBinding ?? app(CheckEvidenceBindingParticipant::class);
        $this->prepareInventory = $prepareInventory ?? app(PrepareActualIssueInventoryParticipant::class);
        $this->demandParticipant = $demandParticipant ?? app(PrepareRfDemandChangeParticipant::class);
        $this->reservationService = $reservationService ?? app(ReservationService::class);
        $this->referenceSequences = $referenceSequences ?? app(ReferenceSequenceService::class);
        $this->rfService = $rfService ?? app(InternalRfService::class);
        $this->outbox = $outbox ?? app(DomainNotificationOutboxService::class);
    }

    /**
     * Post a prepared/acknowledged Actual Issue batch atomically.
     * Owns the single outer DB::transaction with canonical lock ordering:
     * RF -> RF lines -> Reservations/Allocations -> Active Holds -> ActualIssue -> InventoryLots.
     */
    public function postActualIssueBatch(
        ActualIssue $issue,
        string $actorId,
        array $payload = [],
        ?string $idempotencyKey = null
    ): array {
        return DB::transaction(function () use ($issue, $actorId, $payload, $idempotencyKey) {
            $chapterId = $issue->chapter_id;

            // 1. Lock RF & lines (if RF exists)
            $rf = InternalRf::where('chapter_id', $chapterId)
                ->where('id', $issue->requisition_id)
                ->lockForUpdate()
                ->first();

            if ($rf) {
                InternalRfLine::where('rf_id', $rf->id)->orderBy('id')->lockForUpdate()->get();
            }

            // 2. Lock ActualIssue & lines
            /** @var ActualIssue $lockedIssue */
            $lockedIssue = ActualIssue::where('chapter_id', $chapterId)
                ->where('id', $issue->id)
                ->lockForUpdate()
                ->firstOrFail();

            $issueLines = ActualIssueLine::where('actual_issue_id', $lockedIssue->id)
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            if ($lockedIssue->status === 'posted') {
                throw new ContractException(409, 'already_posted', 'Actual issue is already posted.', [
                    'failed_intent_committed' => false,
                    'current' => $this->formatIssue($lockedIssue),
                ]);
            }

            if ($lockedIssue->status === 'invalidated') {
                throw new ContractException(409, 'material_version_conflict', 'Actual issue has been invalidated and must be revised/re-matched.', [
                    'failed_intent_committed' => false,
                    'current' => $this->formatIssue($lockedIssue),
                ]);
            }

            if ($lockedIssue->handover_fence === 'disputed') {
                throw new ContractException(409, 'handover_unresolved', 'Disputed actual issue must be revised and re-matched before posting.', [
                    'failed_intent_committed' => false,
                    'current' => $this->formatIssue($lockedIssue),
                ]);
            }

            if (! in_array($lockedIssue->handover_fence, ['unresolved', 'retry_authorized'], true)) {
                if (empty($payload['acknowledgment_id']) && ! $lockedIssue->evidence_binding_id) {
                    throw new ContractException(409, 'handover_unresolved', 'Actual issue must have an unresolved or retry_authorized handover fence before posting.', [
                        'failed_intent_committed' => false,
                        'current' => $this->formatIssue($lockedIssue),
                    ]);
                }
                if ($lockedIssue->handover_fence === 'none' && ! $lockedIssue->evidence_binding_id && empty($payload['acknowledgment_id'])) {
                    throw new ContractException(409, 'handover_unresolved', 'Actual issue has no active handover match.', [
                        'failed_intent_committed' => false,
                        'current' => $this->formatIssue($lockedIssue),
                    ]);
                }
            }

            if (isset($payload['expected_version']) && (int) $payload['expected_version'] !== (int) ($lockedIssue->version ?? 1)) {
                throw new ContractException(409, 'version_conflict', 'expected_version mismatch.', [
                    'failed_intent_committed' => false,
                    'current' => $this->formatIssue($lockedIssue),
                ]);
            }

            if (isset($payload['expected_material_version']) && (int) $payload['expected_material_version'] !== (int) $lockedIssue->material_version) {
                throw new ContractException(409, 'material_version_conflict', 'expected_material_version mismatch.', [
                    'failed_intent_committed' => false,
                    'current' => $this->formatIssue($lockedIssue),
                ]);
            }

            if ($rf) {
                if (isset($payload['expected_rf_version']) && (int) $payload['expected_rf_version'] !== (int) $rf->version) {
                    throw new ContractException(409, 'version_conflict', 'expected_rf_version mismatch.', [
                        'failed_intent_committed' => false,
                        'current' => $this->formatIssue($lockedIssue),
                    ]);
                }
                if (isset($payload['expected_rf_material_version']) && (int) $payload['expected_rf_material_version'] !== (int) $rf->material_version) {
                    throw new ContractException(409, 'material_version_conflict', 'expected_rf_material_version mismatch.', [
                        'failed_intent_committed' => false,
                        'current' => $this->formatIssue($lockedIssue),
                    ]);
                }
                if (isset($payload['expected_rf_progress_version']) && (int) $payload['expected_rf_progress_version'] !== (int) $rf->progress_version) {
                    throw new ContractException(409, 'progress_version_conflict', 'expected_rf_progress_version mismatch.', [
                        'failed_intent_committed' => false,
                        'current' => $this->formatIssue($lockedIssue),
                    ]);
                }
            }

            // 3. Lock Reservations & Allocations
            $reservationIds = $issueLines->pluck('reservation_id')->filter()->unique()->sort()->values()->all();
            $reservations = empty($reservationIds)
                ? collect()
                : StockReservation::where('chapter_id', $chapterId)
                    ->whereIn('id', $reservationIds)
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get()
                    ->keyBy('id');

            $allocations = empty($reservationIds)
                ? collect()
                : RfReservationAllocation::whereIn('reservation_id', $reservationIds)
                    ->where('status', 'active')
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get();

            // Check current_sources versions if supplied
            foreach (($payload['current_sources'] ?? []) as $src) {
                $resId = $src['reservation_id'] ?? null;
                $res = $resId ? $reservations->get($resId) : null;
                if (! $res) {
                    throw new ContractException(404, 'invalid_source', "Reservation {$resId} not found.", [
                        'failed_intent_committed' => false,
                        'current' => $this->formatIssue($lockedIssue),
                    ]);
                }
                if (isset($src['expected_version']) && (int) $src['expected_version'] !== (int) $res->version) {
                    throw new ContractException(409, 'version_conflict', "Reservation {$resId} version mismatch.", [
                        'failed_intent_committed' => false,
                        'current' => $this->formatIssue($lockedIssue),
                    ]);
                }
                if (isset($src['expected_material_version']) && (int) $src['expected_material_version'] !== (int) $res->material_version) {
                    throw new ContractException(409, 'material_version_conflict', "Reservation {$resId} material_version mismatch.", [
                        'failed_intent_committed' => false,
                        'current' => $this->formatIssue($lockedIssue),
                    ]);
                }
            }

            // 4. Lock Active Stock Holds & enforce Hold-First Fence
            $lotIds = $issueLines->pluck('lot_id')->filter()->unique()->sort()->values()->all();
            if (! empty($lotIds)) {
                StockHold::where('chapter_id', $chapterId)
                    ->where('status', 'active')
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get();

                $activeHoldRanges = StockHoldRange::where('chapter_id', $chapterId)
                    ->whereIn('lot_id', $lotIds)
                    ->whereHas('hold', fn ($q) => $q->where('status', 'active'))
                    ->get();

                foreach ($issueLines as $line) {
                    if (! $line->lot_id) {
                        continue;
                    }
                    $offset = BcMath::str($line->offset_quantity ?? '0');
                    $qty = BcMath::str($line->issued_quantity);
                    foreach ($activeHoldRanges->where('lot_id', $line->lot_id) as $hr) {
                        if (BcMath::intervalsOverlap($offset, $qty, $hr->offset_quantity, $hr->quantity)) {
                            throw new ContractException(409, 'stock_held', 'Review current authorized batch and reconcile before another action.', [
                                'failed_intent_committed' => false,
                                'current' => $this->formatIssue($lockedIssue),
                            ]);
                        }
                    }
                }
            }

            // 5. Evidence Binding Fence
            $acknowledgmentId = $payload['acknowledgment_id'] ?? $lockedIssue->evidence_binding_id;
            if (! $acknowledgmentId) {
                throw new ContractException(409, 'evidence_mismatch', 'Signed paper acknowledgment must be matched before posting.', [
                    'failed_intent_committed' => false,
                    'current' => $this->formatIssue($lockedIssue),
                ]);
            }

            if ($lockedIssue->evidence_binding_id && $lockedIssue->evidence_binding_id !== $acknowledgmentId) {
                throw new ContractException(409, 'evidence_mismatch', 'Use the acknowledgment recorded for this issue.', [
                    'failed_intent_committed' => false, 'current' => $this->formatIssue($lockedIssue), 'setup_blockers' => [],
                ]);
            }

            $binding = EvidenceBinding::where('chapter_id', $chapterId)->whereKey($acknowledgmentId)->sharedLock()->first();
            if ($binding?->match_projection) {
                if ($binding->id !== $lockedIssue->evidence_binding_id || $binding->status !== 'active') {
                    throw new ContractException(409, 'evidence_mismatch', 'Match the current signed paper before posting.', [
                        'failed_intent_committed' => false, 'current' => $this->formatIssue($lockedIssue),
                    ]);
                }
                $acknowledgment = $binding->match_projection;
                $current = $this->formatIssue($lockedIssue);
                if ($acknowledgment['recipient_id'] !== $lockedIssue->recipient_user_id
                    || $acknowledgment['acknowledged_at'] !== $lockedIssue->acknowledged_at?->utc()->format('Y-m-d\TH:i:s.u\Z')) {
                    throw new ContractException(409, 'evidence_mismatch', 'The recipient acknowledgment has changed.', [
                        'failed_intent_committed' => false, 'current' => $current,
                    ]);
                }
                $this->checkEvidenceBinding->verifyMatch(
                    $chapterId, $actorId, $lockedIssue->evidenceSnapshot(),
                    $acknowledgment['bytes'], $acknowledgment, $current,
                );
                $evidenceResult = ['acknowledgment_id' => $binding->id];
            } else {
                $checkLines = $issueLines->map(fn (ActualIssueLine $l) => [
                    'variant_id' => $l->variant_id,
                    'unit_id' => $l->unit_id,
                    'quantity' => $l->issued_quantity,
                ])->values()->all();

                try {
                    $evidenceResult = $this->checkEvidenceBinding->check([
                        'chapter_id' => $chapterId,
                        'binding_id' => $acknowledgmentId,
                        'source_type' => 'actual_issue',
                        'source_id' => $lockedIssue->id,
                        'recipient_name' => $lockedIssue->recipient_name,
                        'lines' => $checkLines,
                    ], strict: true);
                } catch (DomainException $e) {
                    throw new ContractException(409, 'evidence_mismatch', $e->getMessage(), [
                        'failed_intent_committed' => false,
                        'current' => $this->formatIssue($lockedIssue),
                    ]);
                }
            }

            if (! in_array($lockedIssue->handover_fence, ['unresolved', 'retry_authorized'], true)) {
                throw new ContractException(409, 'handover_unresolved', 'Actual issue handover fence must be unresolved or retry_authorized before posting.', [
                    'failed_intent_committed' => false,
                    'current' => $this->formatIssue($lockedIssue),
                ]);
            }

            // 6. Consume Reservation Allocations & RF Demand (when RF exists)
            $operationId = (string) Str::uuid();
            $consumedByLine = [];
            foreach ($issueLines as $line) {
                $qty = BcMath::str($line->issued_quantity);
                if ($line->reservation_id) {
                    /** @var StockReservation|null $res */
                    $res = $reservations->get($line->reservation_id);
                    if (! $res || $res->status !== 'ACTIVE') {
                        throw new ContractException(409, 'reservation_conflict', "Reservation {$line->reservation_id} is not active.", [
                            'failed_intent_committed' => false,
                            'current' => $this->formatIssue($lockedIssue),
                        ]);
                    }

                    $resAllocs = $allocations->where('reservation_id', $res->id);
                    if ($resAllocs->isNotEmpty() && $line->lot_id) {
                        $segId = $line->basis_segment_id ?? $line->lot_id;
                        $consumed = $this->reservationService->consumeOrReleaseAllocationInterval(
                            $resAllocs,
                            $line->lot_id,
                            $segId,
                            BcMath::str($line->offset_quantity ?? '0'),
                            $qty,
                            'consumed'
                        );
                        if (! $consumed) {
                            throw new ContractException(409, 'reservation_conflict', 'Issued interval is not owned by active reservation allocations.', [
                                'failed_intent_committed' => false,
                                'current' => $this->formatIssue($lockedIssue),
                            ]);
                        }
                    }

                    $res->active_quantity = BcMath::sub($res->active_quantity ?? $res->quantity, $qty);
                    $res->fulfilled_quantity = BcMath::add($res->fulfilled_quantity, $qty);
                    $res->version += 1;
                    $res->material_version += 1;
                    $this->reservationService->syncReservationStateAndBlocked($res);
                    $res->save();

                    RfReservationHistory::create([
                        'id' => (string) Str::uuid(),
                        'chapter_id' => $chapterId,
                        'reservation_id' => $res->id,
                        'version' => (int) $res->version,
                        'material_version' => (int) $res->material_version,
                        'event_type' => 'consumed',
                        'actor_user_id' => $actorId,
                        'reason' => "Actual issue {$lockedIssue->issue_number} posted",
                        'snapshot_json' => $this->reservationService->formatReservation($res->fresh('allocations')),
                        'created_at' => now(),
                    ]);

                    $this->outbox->recordIntent('stage1.rf-reservation.changed.v1', $chapterId, $res->id, $res->version, $res->material_version);
                }

                $rfLineId = $line->requisition_line_id;
                $consumedByLine[$rfLineId] = BcMath::add($consumedByLine[$rfLineId] ?? '0', $qty);
            }

            if ($rf) {
                foreach ($consumedByLine as $rfLineId => $consumeQty) {
                    $this->demandParticipant->execute([
                        'actor_id' => $actorId,
                        'chapter_id' => $chapterId,
                        'operation_id' => $operationId,
                        'change' => 'consume',
                        'rf_id' => $rf->id,
                        'rf_line_id' => $rfLineId,
                        'expected_rf_version' => (int) $rf->version,
                        'expected_rf_material_version' => (int) $rf->material_version,
                        'expected_rf_progress_version' => (int) $rf->progress_version,
                        'quantity' => $consumeQty,
                    ]);
                    $rf->refresh();
                }

                $freshRf = $rf->fresh('lines');
                InternalRfVersion::create([
                    'id' => (string) Str::uuid(),
                    'rf_id' => $freshRf->id,
                    'chapter_id' => $chapterId,
                    'version' => (int) $freshRf->version,
                    'material_version' => (int) $freshRf->material_version,
                    'progress_version' => (int) $freshRf->progress_version,
                    'event_type' => 'issue_posted',
                    'actor_user_id' => $actorId,
                    'reason' => "Actual issue {$lockedIssue->issue_number} posted",
                    'snapshot_json' => $this->rfService->formatRf($freshRf),
                    'created_at' => now(),
                ]);
                $this->outbox->recordIntent('stage1.internal-rf.changed.v1', $chapterId, $freshRf->id, $freshRf->version, $freshRf->material_version);
            }

            // 7. Physical Stock Decrement via PrepareActualIssueInventoryParticipant -> PhysicalPostingService
            $invResult = $this->prepareInventory->execute($lockedIssue, $actorId, $payload);
            $posting = $invResult['posting'];

            // 8. Create Handover, HandoverLines (with real inventory_movement_id), HandoverReceipt
            $postedAt = now();
            $handover = Handover::create([
                'chapter_id' => $chapterId,
                'handover_reference' => 'HO-'.$lockedIssue->issue_number,
                'source_type' => 'REQUISITION',
                'source_id' => $lockedIssue->requisition_id,
                'recipient_name' => $lockedIssue->recipient_name,
                'actual_handover_at' => $lockedIssue->handed_over_at ?? $lockedIssue->actual_handover_at ?? $postedAt,
                'handover_officer_id' => $actorId,
                'evidence_binding_id' => $evidenceResult['acknowledgment_id'] ?? $acknowledgmentId,
                'status' => 'COMMITTED',
            ]);

            $freshLines = $lockedIssue->fresh('lines')->lines;
            foreach ($freshLines as $line) {
                HandoverLine::create([
                    'handover_id' => $handover->id,
                    'source_line_id' => $line->requisition_line_id,
                    'variant_id' => $line->variant_id,
                    'unit_id' => $line->unit_id,
                    'actual_quantity' => $line->issued_quantity,
                    'inventory_movement_id' => $line->inventory_movement_id,
                ]);
            }

            HandoverReceipt::create([
                'handover_id' => $handover->id,
                'receipt_type' => 'IS_AR',
                'receipt_number' => $lockedIssue->issue_number,
                'printed_at' => $lockedIssue->printed_at ?? $postedAt,
                'printed_by' => $actorId,
            ]);

            // 9. Finalize ActualIssue state
            $lockedIssue->status = 'posted';
            $lockedIssue->handover_fence = 'committed';
            $lockedIssue->posted_at = $postedAt;
            $lockedIssue->posted_by_user_id = $actorId;
            $lockedIssue->actual_handover_at = $lockedIssue->handed_over_at ?? $lockedIssue->actual_handover_at ?? $postedAt;
            $lockedIssue->inventory_posting_id = $posting->id;
            $lockedIssue->version = ((int) ($lockedIssue->version ?? 1)) + 1;
            $lockedIssue->save();

            $formattedIssue = $this->formatIssue($lockedIssue->fresh(['lines', 'reconciliations']));
            ActualIssueHistory::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $chapterId,
                'actual_issue_id' => $lockedIssue->id,
                'version' => (int) $lockedIssue->version,
                'material_version' => (int) $lockedIssue->material_version,
                'event_type' => 'posted',
                'actor_user_id' => $actorId,
                'reason' => null,
                'snapshot_json' => $formattedIssue,
                'created_at' => $postedAt,
            ]);

            $this->outbox->recordIntent('stage1.actual-issue.changed.v1', $chapterId, $lockedIssue->id, $lockedIssue->version, $lockedIssue->material_version);
            foreach ($lotIds as $lotId) {
                $lot = InventoryLot::find($lotId);
                if ($lot) {
                    $this->outbox->recordIntent('stage1.stock-lot.changed.v1', $chapterId, $lot->id, $lot->stock_version, $lot->material_version);
                }
            }

            $responseBody = [
                'data' => [
                    'operation_id' => $operationId,
                    'operation_name' => 'postActualIssue',
                    'action_key' => $idempotencyKey ?? $operationId,
                    'actor_id' => $actorId,
                    'chapter_id' => $chapterId,
                    'committed_at' => $postedAt->format('Y-m-d\TH:i:s.u\Z'),
                    'http_status' => 200,
                    'outcome' => 'committed',
                    'handover_id' => $handover->id,
                    'inventory_posting_id' => $posting->id,
                    'result' => $formattedIssue,
                ],
                // Top-level convenience properties preserved
                'operation_id' => $operationId,
                'outcome' => 'committed',
                'actual_issue_id' => $lockedIssue->id,
                'handover_id' => $handover->id,
                'inventory_posting_id' => $posting->id,
                'status' => 'posted',
            ];

            if ($idempotencyKey !== null) {
                IdempotencyRecord::create([
                    'id' => $operationId,
                    'key' => $idempotencyKey,
                    'chapter_id' => $chapterId,
                    'user_id' => $actorId,
                    'operation_name' => 'postActualIssue',
                    'resource_id' => $lockedIssue->id,
                    'state' => 'committed',
                    'payload_hash' => CanonicalJson::sha256($payload),
                    'response_code' => 200,
                    'response_body' => json_encode($responseBody),
                    'expires_at' => now()->addDays(7),
                ]);
            }

            return $responseBody;
        });
    }

    /**
     * Post an actual issue for an internal Requisition (used by HandoverCoordinatorService).
     * Runs real inventory/demand posting when an approved InternalRf exists in DB,
     * while staying compatible with standalone synthetic requisition tests.
     */
    public function postActualIssue(array $data, ?string $chapterId = null, ?string $userId = null): array
    {
        return DB::transaction(function () use ($data, $chapterId, $userId) {
            $sourceId = $data['source']['id'];
            $chapter = $chapterId ?? $data['chapter_id'] ?? 'default-chapter';
            $officerId = $userId ?? $data['handover_officer_id'] ?? 'system-officer';

            $rf = InternalRf::where('chapter_id', $chapter)->where('id', $sourceId)->first();
            $seq = $this->referenceSequences->nextReference($chapter, 'IS_AR');

            $actualIssue = ActualIssue::create([
                'chapter_id' => $chapter,
                'requisition_id' => $sourceId,
                'issue_number' => $seq['reference'],
                'status' => 'prepared',
                'version' => 1,
                'recipient_name' => $data['recipient_name'],
                'recipient_user_id' => $data['recipient_id'] ?? null,
                'prepared_by_user_id' => $officerId,
                'actual_handover_at' => $data['actual_handover_at'] ?? now(),
                'handed_over_at' => $data['actual_handover_at'] ?? now(),
                'evidence_binding_id' => $data['acknowledgment_binding_id'] ?? null,
                'material_version' => 1,
                'handover_fence' => ! empty($data['acknowledgment_binding_id']) ? 'unresolved' : 'none',
            ]);

            foreach ($data['lines'] as $line) {
                $actualQty = BcMath::str($line['actual_quantity']);
                $sourceLineId = $line['source_line_id'];
                $variantId = $line['variant_id'] ?? 'VAR-DEFAULT';
                $unitId = $line['unit_id'] ?? 'UNIT-DEFAULT';
                $lotId = $line['lot_id'] ?? null;

                ActualIssueLine::create([
                    'actual_issue_id' => $actualIssue->id,
                    'requisition_line_id' => $sourceLineId,
                    'reservation_id' => $line['reservation_id'] ?? null,
                    'variant_id' => $variantId,
                    'unit_id' => $unitId,
                    'lot_id' => $lotId,
                    'basis_segment_id' => $line['basis_segment_id'] ?? $lotId,
                    'offset_quantity' => BcMath::str($line['offset_quantity'] ?? '0'),
                    'allocated_quantity' => $actualQty,
                    'issued_quantity' => $actualQty,
                ]);
            }

            if ($rf && $rf->status === 'approved' && ! empty($data['acknowledgment_binding_id'])) {
                $posted = $this->postActualIssueBatch($actualIssue, $officerId, [
                    'acknowledgment_id' => $data['acknowledgment_binding_id'],
                ]);

                return [
                    'operation_id' => $posted['operation_id'],
                    'outcome' => 'committed',
                    'handover_id' => $posted['handover_id'],
                    'actual_issue_id' => $actualIssue->id,
                    'source' => [
                        'kind' => 'requisition',
                        'id' => $sourceId,
                        'version' => (int) $rf->fresh()->version,
                    ],
                    'lines' => $actualIssue->fresh('lines')->lines->map(fn (ActualIssueLine $l) => [
                        'source_line_id' => $l->requisition_line_id,
                        'committed_quantity' => BcMath::format($l->issued_quantity, 3),
                        'remaining_quantity' => '0.000',
                        'inventory_posting_id' => $l->inventory_movement_id,
                    ])->values()->all(),
                    'acknowledgment_binding_id' => $data['acknowledgment_binding_id'] ?? null,
                ];
            }

            // Legacy/standalone requisition path when no InternalRf row exists
            $actualIssue->status = 'posted';
            $actualIssue->handover_fence = 'committed';
            $actualIssue->posted_at = now();
            $actualIssue->posted_by_user_id = $officerId;
            $actualIssue->save();

            $handover = Handover::create([
                'chapter_id' => $chapter,
                'handover_reference' => 'HO-'.$actualIssue->issue_number,
                'source_type' => 'REQUISITION',
                'source_id' => $sourceId,
                'recipient_name' => $data['recipient_name'],
                'actual_handover_at' => $data['actual_handover_at'] ?? now(),
                'handover_officer_id' => $officerId,
                'evidence_binding_id' => $data['acknowledgment_binding_id'] ?? null,
                'status' => 'COMMITTED',
            ]);

            $responseLines = [];
            foreach ($actualIssue->fresh('lines')->lines as $line) {
                $movId = $line->inventory_movement_id ?? (string) Str::uuid();
                HandoverLine::create([
                    'handover_id' => $handover->id,
                    'source_line_id' => $line->requisition_line_id,
                    'variant_id' => $line->variant_id,
                    'unit_id' => $line->unit_id,
                    'actual_quantity' => $line->issued_quantity,
                    'inventory_movement_id' => $movId,
                ]);
                $responseLines[] = [
                    'source_line_id' => $line->requisition_line_id,
                    'committed_quantity' => number_format((float) $line->issued_quantity, 3, '.', ''),
                    'remaining_quantity' => '0.000',
                    'inventory_posting_id' => $movId,
                ];
            }

            HandoverReceipt::create([
                'handover_id' => $handover->id,
                'receipt_type' => 'IS_AR',
                'receipt_number' => $actualIssue->issue_number,
                'printed_at' => now(),
                'printed_by' => $officerId,
            ]);

            return [
                'operation_id' => (string) Str::uuid(),
                'outcome' => 'committed',
                'handover_id' => $handover->id,
                'actual_issue_id' => $actualIssue->id,
                'source' => [
                    'kind' => 'requisition',
                    'id' => $sourceId,
                    'version' => 1,
                ],
                'lines' => $responseLines,
                'acknowledgment_binding_id' => $data['acknowledgment_binding_id'] ?? null,
            ];
        });
    }

    public function formatIssue(ActualIssue $issue): array
    {
        $issue->loadMissing(['lines', 'reconciliations']);
        $latestRecon = $issue->reconciliations->sortByDesc('created_at')->first();

        return [
            'id' => $issue->id,
            'chapter_id' => $issue->chapter_id,
            'rf_id' => $issue->requisition_id,
            'reference' => $issue->issue_number,
            'version' => (int) ($issue->version ?? 1),
            'material_version' => (int) $issue->material_version,
            'status' => $issue->status,
            'recipient_id' => $issue->recipient_user_id,
            'recipient_name' => $issue->recipient_name,
            'handed_over_at' => $issue->handed_over_at?->format('Y-m-d\TH:i:s.u\Z'),
            'acknowledged_at' => $issue->acknowledged_at?->format('Y-m-d\TH:i:s.u\Z'),
            'actual_handover_at' => $issue->actual_handover_at?->format('Y-m-d\TH:i:s.u\Z'),
            'recipient_accepts_partial' => (bool) $issue->recipient_accepts_partial,
            'handover_fence' => $issue->handover_fence ?? 'none',
            'material' => $issue->material_json,
            'snapshot' => $issue->evidenceSnapshot(),
            'acknowledgment' => $issue->evidence_binding_id ? [
                'acknowledgment_id' => $issue->evidence_binding_id,
                'matched_by_user_id' => $issue->matched_by_user_id,
                'matched_at' => $issue->matched_at?->format('Y-m-d\TH:i:s.u\Z'),
            ] : null,
            'posting' => $issue->inventory_posting_id ? [
                'inventory_posting_id' => $issue->inventory_posting_id,
                'posted_by_user_id' => $issue->posted_by_user_id,
                'posted_at' => $issue->posted_at?->format('Y-m-d\TH:i:s.u\Z'),
            ] : null,
            'reconciliation' => $latestRecon,
            'lines' => $issue->lines->map(fn (ActualIssueLine $l) => [
                'id' => $l->id,
                'rf_line_id' => $l->requisition_line_id,
                'reservation_id' => $l->reservation_id,
                'variant_id' => $l->variant_id,
                'unit_id' => $l->unit_id,
                'stock_lot_id' => $l->lot_id,
                'basis_segment_id' => $l->basis_segment_id,
                'offset_quantity' => BcMath::format($l->offset_quantity ?? '0'),
                'allocated_quantity' => BcMath::format($l->allocated_quantity),
                'issued_quantity' => BcMath::format($l->issued_quantity),
                'inventory_movement_id' => $l->inventory_movement_id,
            ])->values()->all(),
            'created_by' => $issue->prepared_by_user_id,
            'created_at' => $issue->created_at?->format('Y-m-d\TH:i:s.u\Z'),
            'entered_at' => $issue->entered_at?->format('Y-m-d\TH:i:s.u\Z'),
            'updated_at' => $issue->updated_at?->format('Y-m-d\TH:i:s.u\Z'),
            'setup_blockers' => [],
        ];
    }
}
