<?php

namespace App\Services\Receiving;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Requests\ReceivingInput;
use App\Http\Resources\ReceivingResource;
use App\Http\Resources\RepfResource;
use App\Models\ActionReceipt;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Donation;
use App\Models\EvidenceRecord;
use App\Models\PurchaseOrder;
use App\Models\ReceivingDiscrepancy;
use App\Models\ReceivingHold;
use App\Models\ReceivingReport;
use App\Models\Stage2RecordHistory;
use App\Services\Authority\ChapterAuthority;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\CanonicalJson;
use Brick\Math\BigDecimal;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class ReceivingExceptionWorkflow
{
    public const DISCREPANCY_ACTIONS = [
        'notifySupplierOfReceivingDiscrepancy' => 'discrepancy.manage',
        'resolveReceivingDiscrepancy' => 'discrepancy.resolve',
    ];

    public const HOLD_ACTIONS = [
        'createReceivingHold' => 'receiving.hold_manage',
        'linkReceivingHoldSource' => 'receiving.hold_manage',
        'rejectReturnReceivingHold' => 'receiving.hold_manage',
    ];

    public const DISCREPANCY_RELATIONS = ['receivingReport', 'replacementReceivingReport', 'variant.item', 'unit'];

    public const HOLD_RELATIONS = ['recorder', 'holdingLocation'];

    private const PO_RESOLUTIONS = ['supplier_replacement_received', 'returned_to_supplier', 'credit_or_short_closed'];

    private const DA_RESOLUTIONS = ['donated_declined_or_disposed'];

    public function __construct(
        private readonly CheckEvidenceBindingParticipant $evidence,
        private readonly DomainNotificationOutboxService $outbox,
    ) {}

    public function mutateDiscrepancy(Request $request, string $chapterId, string $discrepancyId, string $operation, string $key, array $input): JsonResponse
    {
        if (! Str::isUuid($chapterId, 4)) {
            throw new ContractException(503, 'unavailable', 'Stage 2 notifications are unavailable for this chapter.');
        }

        $actorUser = $request->user();
        $actorId = $actorUser->id;
        $scope = [
            'chapter_id' => $chapterId,
            'user_id' => $actorId,
            'operation' => $operation,
            'key' => $key,
            'evidence_scope' => '',
        ];
        $fingerprint = CanonicalJson::sha256([$discrepancyId, $input]);
        $receipts = ActionReceipt::where($scope);

        if ($existing = (clone $receipts)->first()) {
            return $this->replay($existing, $fingerprint, null);
        }

        $before = null;

        try {
            return DB::transaction(function () use (
                $chapterId, $discrepancyId, $operation, $input, $scope, $fingerprint, $actorUser, $actorId, $receipts, &$before
            ) {
                // Acyclic lock order: receiving_reports (replacement RM) -> receiving_discrepancies -> ActionReceipt -> evidence.
                $replacementRm = null;
                if ($operation === 'resolveReceivingDiscrepancy' && ($input['action'] ?? null) === 'resolve' && is_string($input['replacement_rm_id'] ?? null)) {
                    $replacementRm = ReceivingReport::where('chapter_id', $chapterId)
                        ->whereKey($input['replacement_rm_id'])
                        ->with('lines')
                        ->sharedLock()
                        ->first();
                }

                $discrepancy = ReceivingDiscrepancy::where('chapter_id', $chapterId)
                    ->whereKey($discrepancyId)
                    ->lockForUpdate()
                    ->first();

                if ($discrepancy === null) {
                    if ($existing = (clone $receipts)->sharedLock()->first()) {
                        return $this->replay($existing, $fingerprint, null);
                    }
                    throw ReceivingReportWorkflow::notFound();
                }

                $discrepancy->load(self::DISCREPANCY_RELATIONS);
                $before = ReceivingResource::discrepancy($discrepancy);

                if ($existing = (clone $receipts)->sharedLock()->first()) {
                    return $this->replay($existing, $fingerprint, null);
                }

                if ((int) $discrepancy->version !== $input['expected_version']
                    || (int) $discrepancy->material_version !== $input['expected_material_version']) {
                    throw ReceivingReportWorkflow::conflict('version_conflict', 'Read the current receiving discrepancy before trying again.', $before);
                }

                if ($discrepancy->status === 'resolved') {
                    throw ReceivingReportWorkflow::conflict('discrepancy_already_resolved', 'This receiving discrepancy is already resolved.', $before);
                }

                $now = now('UTC')->toImmutable();
                $nowIso = RepfResource::instant($now);
                $actor = RepfResource::actor($actorUser);

                if ($operation === 'notifySupplierOfReceivingDiscrepancy') {
                    if ($discrepancy->source_kind !== 'po') {
                        throw ReceivingReportWorkflow::conflict('source_not_eligible', 'Supplier notification applies only to PO receiving discrepancies.', $before);
                    }
                    if ($discrepancy->status !== 'open') {
                        throw ReceivingReportWorkflow::conflict('invalid_transition', 'Only open PO discrepancies can notify the supplier.', $before);
                    }
                    $discrepancy->status = 'supplier_notified';
                    $discrepancy->supplier_notification = [
                        'notified_by' => $actor,
                        'notified_at' => $nowIso,
                        'supplier_contact_reference' => $input['supplier_contact_reference'],
                        'notification_notes' => $input['notification_notes'],
                        'expected_resolution_date' => $input['expected_resolution_date'],
                    ];
                } elseif ($input['action'] === 'start_review') {
                    if (! in_array($discrepancy->status, ['open', 'supplier_notified'], true)) {
                        throw ReceivingReportWorkflow::conflict('invalid_transition', 'Only open or supplier-notified discrepancies can start review.', $before);
                    }
                    $discrepancy->status = 'under_review';
                    $discrepancy->review_json = [
                        'review_started_by' => $actor,
                        'review_started_at' => $nowIso,
                        'review_notes' => $input['review_notes'],
                    ];
                } else {
                    if (! in_array($discrepancy->status, ['supplier_notified', 'under_review'], true)) {
                        throw ReceivingReportWorkflow::conflict('invalid_transition', 'Discrepancies must be supplier_notified or under_review before resolution.', $before);
                    }
                    $allowedKinds = $discrepancy->source_kind === 'po' ? self::PO_RESOLUTIONS : self::DA_RESOLUTIONS;
                    if (! in_array($input['resolution_kind'], $allowedKinds, true)) {
                        throw ReceivingReportWorkflow::conflict('source_not_eligible', 'Resolution kind is not eligible for this discrepancy source.', $before);
                    }

                    $replacementRef = null;
                    if ($input['resolution_kind'] === 'supplier_replacement_received') {
                        if ($replacementRm === null) {
                            throw ReceivingReportWorkflow::notFound();
                        }
                        $hasAcceptedReplacementLine = $replacementRm->lines->contains(
                            fn ($line) => $line->source_line_id === $discrepancy->source_line_id
                                && BigDecimal::of($line->accepted_quantity)->isPositive()
                        );
                        if ($replacementRm->id === $discrepancy->rm_id
                            || $replacementRm->source_kind !== 'po'
                            || $replacementRm->status !== 'posted'
                            || $replacementRm->source_id !== $discrepancy->source_id
                            || ! $hasAcceptedReplacementLine) {
                            throw ReceivingReportWorkflow::conflict('source_not_eligible', 'Replacement RM must be a separate posted PO-RM against the same PO with accepted replacement quantity.', $before);
                        }
                        $replacementRef = $replacementRm->rm_reference;
                    }

                    $material = ReceivingResource::discrepancyEvidenceMaterial($discrepancy, $input);
                    $snapshot = [
                        'target' => ['purpose' => 'receiving_discrepancy', 'record_id' => $discrepancy->id],
                        'material_version' => (int) $discrepancy->material_version,
                        'sha256' => CanonicalJson::sha256($material),
                    ];
                    $ackPayload = [
                        'acknowledgment_id' => (string) Str::uuid(),
                        'matched_by' => $actorId,
                        'matched_at' => $nowIso,
                        'recipient_id' => null,
                        'acknowledged_at' => $input['signed_at'],
                        'snapshot' => $snapshot,
                        'bytes' => $input['evidence'],
                    ];
                    $this->evidence->verifyMatch($chapterId, $actorId, $snapshot, $input['evidence'], $ackPayload, $before);

                    $discrepancy->status = 'resolved';
                    $discrepancy->replacement_rm_id = $input['replacement_rm_id'];
                    $discrepancy->quarantined_lots_auto_cleared_on_source_close = false;
                    $discrepancy->resolution = [
                        'resolution_kind' => $input['resolution_kind'],
                        'resolved_by' => $actor,
                        'resolved_at' => $nowIso,
                        'reason' => $input['reason'],
                        'replacement_rm_id' => $input['replacement_rm_id'],
                        'replacement_rm_reference' => $replacementRef,
                        'quarantined_lot_disposition' => $input['quarantined_lot_disposition'],
                        'evidence_acknowledgment' => $ackPayload,
                    ];
                    $discrepancy->material_version++;
                }

                $discrepancy->version++;
                $discrepancy->updated_at = $now;
                $discrepancy->save();
                $discrepancy->load(self::DISCREPANCY_RELATIONS);

                $formatted = ReceivingResource::discrepancy($discrepancy);
                $operationId = (string) Str::uuid();
                $result = [
                    'data' => [
                        'operation_id' => $operationId,
                        'chapter_id' => $chapterId,
                        'actor_id' => $actorId,
                        'operation_name' => $operation,
                        'action_key' => $scope['key'],
                        'resource_kind' => 'receiving_discrepancy',
                        'resource_id' => $discrepancy->id,
                        'committed_version' => (int) $discrepancy->version,
                        'committed_material_version' => (int) $discrepancy->material_version,
                        'status_code' => 200,
                        'committed_at' => $nowIso,
                        'outcome' => 'committed',
                        'result' => $formatted,
                    ],
                ];

                ActionReceipt::create($scope + [
                    'id' => $operationId,
                    'fingerprint' => $fingerprint,
                    'status' => 200,
                    'result' => $result,
                ]);

                $this->outbox->recordIntent(
                    'stage2.receiving-discrepancy.changed.v1',
                    $chapterId,
                    $discrepancy->id,
                    (int) $discrepancy->version,
                    (int) $discrepancy->material_version,
                );

                return response()->json($result, 200, ['X-Action-Replayed' => 'false']);
            });
        } catch (UniqueConstraintViolationException $exception) {
            $existing = (clone $receipts)->sharedLock()->first();
            if ($existing === null) {
                throw $exception;
            }

            return $this->replay($existing, $fingerprint, null);
        } catch (ContractException $exception) {
            if ($exception->statusCode !== 409) {
                throw $exception;
            }
            if (array_key_exists('failed_intent_committed', $exception->extra) && ($exception->extra['current'] !== null || $before === null)) {
                throw $exception;
            }

            throw new ContractException(409, $exception->errorCode, $exception->getMessage(), [
                'failed_intent_committed' => false,
                'current' => $before,
                'setup_blockers' => $exception->extra['setup_blockers'] ?? [],
            ]);
        }
    }

    public function mutateHold(Request $request, string $chapterId, ?string $holdId, string $operation, string $key, array $input): JsonResponse
    {
        if (! Str::isUuid($chapterId, 4)) {
            throw new ContractException(503, 'unavailable', 'Stage 2 notifications are unavailable for this chapter.');
        }

        $authority = $request->attributes->get(ChapterAuthority::class);
        $actorUser = $request->user();
        $actorId = $actorUser->id;
        $scope = [
            'chapter_id' => $chapterId,
            'user_id' => $actorId,
            'operation' => $operation,
            'key' => $key,
            'evidence_scope' => '',
        ];
        $fingerprint = CanonicalJson::sha256([$holdId, $input]);
        $receipts = ActionReceipt::where($scope);

        if ($existing = (clone $receipts)->first()) {
            return $this->replay($existing, $fingerprint, $authority);
        }

        $before = null;

        try {
            return DB::transaction(function () use (
                $chapterId, $holdId, $operation, $input, $scope, $fingerprint, $authority, $actorUser, $actorId, $receipts, &$before
            ) {
                // Acyclic lock order: receiving_holds -> source PO/DA -> ActionReceipt -> evidence.
                $hold = $holdId === null
                    ? new ReceivingHold([
                        'id' => (string) Str::uuid(),
                        'chapter_id' => $chapterId,
                        'status' => 'held',
                        'version' => 1,
                        'material_version' => 1,
                        'recorded_by' => $actorId,
                        'usable_stock_posted' => false,
                        'ipc_creation_prohibited' => true,
                    ])
                    : (ReceivingHold::where('chapter_id', $chapterId)->whereKey($holdId)->lockForUpdate()->first());

                if ($holdId !== null && $hold === null) {
                    if ($existing = (clone $receipts)->sharedLock()->first()) {
                        return $this->replay($existing, $fingerprint, $authority);
                    }
                    throw ReceivingReportWorkflow::notFound();
                }

                if ($holdId !== null) {
                    $hold->load(self::HOLD_RELATIONS);
                    $before = ReceivingResource::hold($hold, $authority);
                }

                $source = null;
                if ($operation === 'linkReceivingHoldSource') {
                    $query = $input['source_kind'] === 'po'
                        ? PurchaseOrder::where('chapter_id', $chapterId)->whereKey($input['source_id'])
                        : Donation::where('chapter_id', $chapterId)->whereKey($input['source_id']);
                    $source = $query->sharedLock()->first();
                }

                if ($existing = (clone $receipts)->sharedLock()->first()) {
                    return $this->replay($existing, $fingerprint, $authority);
                }

                if ($holdId !== null && ((int) $hold->version !== $input['expected_version'] || (int) $hold->material_version !== $input['expected_material_version'])) {
                    throw ReceivingReportWorkflow::conflict('version_conflict', 'Read the current missing-source delivery hold before trying again.', $before);
                }

                $now = now('UTC')->toImmutable();
                $nowIso = RepfResource::instant($now);
                $actor = RepfResource::actor($actorUser);
                $fromStatus = $holdId === null ? null : $hold->status;
                $historyAction = 'held';
                $historyReason = '';
                $linkedSourceReference = null;

                if ($operation === 'createReceivingHold') {
                    $location = CatalogueLocation::where('chapter_id', $chapterId)->whereKey($input['holding_location_id'])->sharedLock()->first()
                        ?? throw ReceivingReportWorkflow::notFound();
                    if ($location->state !== 'active') {
                        throw OpeningDraftInput::invalidInput([
                            ReceivingInput::field('/holding_location_id', 'invalid_format', 'Holding location must be active.'),
                        ]);
                    }

                    $variantIds = array_values(array_unique(array_filter(array_column($input['items'], 'variant_id'))));
                    $unitIds = array_values(array_unique(array_filter(array_column($input['items'], 'unit_id'))));
                    $variants = $variantIds === [] ? collect() : CatalogueVariant::where('chapter_id', $chapterId)->whereIn('id', $variantIds)->orderBy('id')->sharedLock()->get()->keyBy('id');
                    $units = $unitIds === [] ? collect() : CatalogueUnit::where('chapter_id', $chapterId)->whereIn('id', $unitIds)->orderBy('id')->sharedLock()->get()->keyBy('id');

                    $items = [];
                    foreach ($input['items'] as $item) {
                        if ($item['variant_id'] !== null && ! $variants->has($item['variant_id'])) {
                            throw ReceivingReportWorkflow::notFound();
                        }
                        if ($item['unit_id'] !== null && ! $units->has($item['unit_id'])) {
                            throw ReceivingReportWorkflow::notFound();
                        }
                        $items[] = [
                            'id' => (string) Str::uuid(),
                            'variant_id' => $item['variant_id'],
                            'unit_id' => $item['unit_id'],
                            'item_description' => $item['item_description'],
                            'arrived_quantity' => $item['arrived_quantity'],
                            'condition_notes' => $item['condition_notes'],
                        ];
                    }

                    $verifiedIntake = null;
                    if ($input['intake_evidence'] !== null) {
                        $verifiedIntake = $this->evidence->verifyCurrentBytes(
                            $chapterId,
                            $input['intake_evidence'],
                            'missing_source_hold',
                            fn (EvidenceRecord $record) => $record->record_id === $hold->id,
                        );
                    }

                    $hold->fill([
                        'arrived_at' => CarbonImmutable::parse($input['arrived_at'], 'UTC'),
                        'holding_location_id' => $location->id,
                        'carrier_or_sender_name' => $input['carrier_or_sender_name'],
                        'sender_kind' => $input['sender_kind'],
                        'delivery_document_reference' => $input['delivery_document_reference'],
                        'hold_reason' => $input['hold_reason'],
                        'items' => $items,
                        'intake_evidence' => $verifiedIntake,
                        'usable_stock_posted' => false,
                        'ipc_creation_prohibited' => true,
                        'created_at' => $now,
                    ]);
                    $historyAction = 'held';
                    $historyReason = $input['hold_reason'];
                } elseif ($operation === 'linkReceivingHoldSource') {
                    if ($hold->status !== 'held') {
                        throw ReceivingReportWorkflow::conflict('hold_already_resolved', 'This missing-source delivery hold has already been resolved.', $before);
                    }
                    if ($source === null) {
                        throw ReceivingReportWorkflow::notFound();
                    }
                    $eligible = $input['source_kind'] === 'po'
                        ? in_array($source->status, ['issued', 'partially_received'], true) && is_string($source->po_reference) && $source->po_reference !== ''
                        : in_array($source->status, ['acknowledged', 'partially_received'], true) && is_string($source->reference) && $source->reference !== '';
                    if (! $eligible) {
                        throw ReceivingReportWorkflow::conflict('source_not_eligible', 'The selected PO or DA is not eligible to resolve a missing-source hold.', $before);
                    }
                    $linkedSourceReference = $input['source_kind'] === 'po' ? $source->po_reference : $source->reference;

                    $hold->status = 'linked_to_source';
                    $hold->source_kind = $input['source_kind'];
                    $hold->source_id = $source->id;
                    $hold->linked_source = [
                        'source_kind' => $input['source_kind'],
                        'source_id' => $source->id,
                        'source_reference' => $linkedSourceReference,
                        'supplier_dr_reference' => $input['supplier_dr_reference'],
                        'supplier_dr_date' => $input['supplier_dr_date'],
                        'linked_by' => $actor,
                        'linked_at' => $nowIso,
                        'link_notes' => $input['link_notes'],
                    ];
                    $hold->usable_stock_posted = false;
                    $hold->ipc_creation_prohibited = true;
                    $hold->version++;
                    $hold->material_version++;
                    $historyAction = 'linked_to_source';
                    $historyReason = $input['link_notes'];
                } else {
                    if ($hold->status !== 'held') {
                        throw ReceivingReportWorkflow::conflict('hold_already_resolved', 'This missing-source delivery hold has already been resolved.', $before);
                    }
                    $material = ReceivingResource::holdRejectionEvidenceMaterial($hold, $input);
                    $snapshot = [
                        'target' => ['purpose' => 'missing_source_hold', 'record_id' => $hold->id],
                        'material_version' => (int) $hold->material_version,
                        'sha256' => CanonicalJson::sha256($material),
                    ];
                    $ackPayload = [
                        'acknowledgment_id' => (string) Str::uuid(),
                        'matched_by' => $actorId,
                        'matched_at' => $nowIso,
                        'recipient_id' => null,
                        'acknowledged_at' => $input['signed_at'],
                        'snapshot' => $snapshot,
                        'bytes' => $input['evidence'],
                    ];
                    $this->evidence->verifyMatch($chapterId, $actorId, $snapshot, $input['evidence'], $ackPayload, $before);

                    $hold->status = 'rejected_returned';
                    $hold->rejection_return = [
                        'rejected_by' => $actor,
                        'rejected_at' => $nowIso,
                        'reason' => $input['reason'],
                        'recipient_or_carrier_name' => $input['recipient_or_carrier_name'],
                        'evidence_acknowledgment' => $ackPayload,
                    ];
                    $hold->usable_stock_posted = false;
                    $hold->ipc_creation_prohibited = true;
                    $hold->version++;
                    $hold->material_version++;
                    $historyAction = 'rejected_returned';
                    $historyReason = $input['reason'];
                }

                $hold->updated_at = $now;
                $hold->save();
                $hold->load(self::HOLD_RELATIONS);

                $unredacted = ReceivingResource::hold($hold, null, false);
                $statusCode = $operation === 'createReceivingHold' ? 201 : 200;
                $operationId = (string) Str::uuid();
                $storedResult = [
                    'data' => [
                        'operation_id' => $operationId,
                        'chapter_id' => $chapterId,
                        'actor_id' => $actorId,
                        'operation_name' => $operation,
                        'action_key' => $scope['key'],
                        'resource_kind' => 'receiving_hold',
                        'resource_id' => $hold->id,
                        'committed_version' => (int) $hold->version,
                        'committed_material_version' => (int) $hold->material_version,
                        'status_code' => $statusCode,
                        'committed_at' => $nowIso,
                        'outcome' => 'committed',
                        'result' => $unredacted,
                    ],
                ];

                ActionReceipt::create($scope + [
                    'id' => $operationId,
                    'fingerprint' => $fingerprint,
                    'status' => $statusCode,
                    'result' => $storedResult,
                ]);

                $history = self::holdHistory($hold);
                $history->create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $chapterId,
                    'record_kind' => 'receiving_hold',
                    'record_id' => $hold->id,
                    'sequence_no' => ((int) (clone $history)->max('sequence_no')) + 1,
                    'version' => (int) $hold->version,
                    'material_version' => (int) $hold->material_version,
                    'is_version_snapshot' => true,
                    'event_type' => $historyAction,
                    'actor_user_id' => $actorId,
                    'reason' => $historyReason,
                    'snapshot_json' => $unredacted,
                    'operation_json' => [
                        'operation_id' => $operationId,
                        'from_status' => $fromStatus,
                        'actor' => $actor,
                        'linked_source_reference' => $linkedSourceReference,
                    ],
                    'recorded_at' => $now,
                ]);

                $this->outbox->recordIntent(
                    'stage2.receiving-hold.changed.v1',
                    $chapterId,
                    $hold->id,
                    (int) $hold->version,
                    (int) $hold->material_version,
                );

                $responseBody = $storedResult;
                $responseBody['data']['result'] = ReceivingResource::redactHoldEvidence($unredacted, $authority);

                return response()->json($responseBody, $statusCode, ['X-Action-Replayed' => 'false']);
            });
        } catch (UniqueConstraintViolationException $exception) {
            $existing = (clone $receipts)->sharedLock()->first();
            if ($existing === null) {
                throw $exception;
            }

            return $this->replay($existing, $fingerprint, $authority);
        } catch (ContractException $exception) {
            if ($exception->statusCode !== 409) {
                throw $exception;
            }
            if (array_key_exists('failed_intent_committed', $exception->extra) && ($exception->extra['current'] !== null || $before === null)) {
                throw $exception;
            }

            throw new ContractException(409, $exception->errorCode, $exception->getMessage(), [
                'failed_intent_committed' => false,
                'current' => $before,
                'setup_blockers' => $exception->extra['setup_blockers'] ?? [],
            ]);
        }
    }

    private function replay(ActionReceipt $receipt, string $fingerprint, ?ChapterAuthority $authority): JsonResponse
    {
        if (! hash_equals($receipt->fingerprint, $fingerprint)) {
            throw ReceivingReportWorkflow::conflict('action_key_conflict', 'Use a new action key for changed input.');
        }

        $body = $receipt->result;
        if ($authority !== null && ($body['data']['resource_kind'] ?? null) === 'receiving_hold' && isset($body['data']['result'])) {
            $body['data']['result'] = ReceivingResource::redactHoldEvidence($body['data']['result'], $authority);
        }

        return response()->json($body, $receipt->status, ['X-Action-Replayed' => 'true']);
    }

    public static function holdHistory(ReceivingHold $hold): Builder
    {
        return Stage2RecordHistory::where('chapter_id', $hold->chapter_id)
            ->where('record_kind', 'receiving_hold')
            ->where('record_id', $hold->id);
    }
}
