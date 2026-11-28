<?php

namespace App\Services\Receiving;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Requests\ReceivingInput;
use App\Http\Resources\DonationResource;
use App\Http\Resources\PurchaseOrderResource;
use App\Http\Resources\ReceivingResource;
use App\Http\Resources\RepfResource;
use App\Models\ActionReceipt;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\ChapterMembership;
use App\Models\ChapterOpeningGuard;
use App\Models\Donation;
use App\Models\InventoryLot;
use App\Models\PolicyRecord;
use App\Models\PurchaseOrder;
use App\Models\ReceivingDiscrepancy;
use App\Models\ReceivingHold;
use App\Models\ReceivingReport;
use App\Models\Stage2RecordHistory;
use App\Models\User;
use App\Services\Authority\ChapterAuthority;
use App\Services\Donations\DonationWorkflow;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Inventory\Participants\ReceivingInventoryParticipant;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Procurement\PurchaseOrderWorkflow;
use App\Services\Shared\CanonicalJson;
use App\Services\Shared\ReferenceSequenceService;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class ReceivingReportWorkflow
{
    public const ACTIONS = [
        'createReceivingReport' => 'receiving.draft',
        'replaceReceivingReport' => 'receiving.draft',
        'inspectReceivingReport' => 'receiving.inspect',
        'matchReceivingReportEvidence' => 'receiving.match_evidence',
        'postReceivingReport' => 'receiving.post',
        'cancelReceivingReport' => 'receiving.cancel',
    ];

    public const RELATIONS = ['preparer', 'poster', 'location', 'lines.variant.item', 'lines.unit'];

    private const HISTORY_ACTIONS = [
        'createReceivingReport' => 'created',
        'replaceReceivingReport' => 'draft_replaced',
        'inspectReceivingReport' => 'inspected',
        'matchReceivingReportEvidence' => 'evidence_matched',
        'postReceivingReport' => 'posted',
        'cancelReceivingReport' => 'canceled',
    ];

    private const MAX_PHP = '999999999999.99';

    public function __construct(
        private readonly CheckEvidenceBindingParticipant $evidence,
        private readonly ReferenceSequenceService $sequences,
        private readonly ReceivingInventoryParticipant $inventory,
        private readonly DomainNotificationOutboxService $outbox,
    ) {}

    public function mutate(Request $request, string $chapterId, ?string $rmId, string $operation, string $key, array $input): JsonResponse
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
        $fingerprint = CanonicalJson::sha256([$rmId, $input]);
        $receipts = ActionReceipt::where($scope);

        if ($existing = (clone $receipts)->first()) {
            return $this->replay($existing, $fingerprint);
        }

        $before = null;

        try {
            return DB::transaction(function () use (
                $chapterId, $rmId, $operation, $input, $scope, $fingerprint, $actorUser, $actorId, $receipts, &$before
            ) {
                $existingMeta = $rmId === null ? null : DB::table('receiving_reports')
                    ->where('chapter_id', $chapterId)
                    ->where('id', $rmId)
                    ->first(['source_kind', 'source_id', 'originating_hold_id']);

                if ($rmId !== null && $existingMeta === null) {
                    if ($existing = (clone $receipts)->sharedLock()->first()) {
                        return $this->replay($existing, $fingerprint);
                    }
                    throw self::notFound();
                }

                $sourceKind = $rmId === null ? $input['source_kind'] : (string) $existingMeta->source_kind;
                $sourceId = $rmId === null ? $input['source_id'] : (string) $existingMeta->source_id;
                $holdId = $rmId === null ? $input['originating_hold_id'] : $existingMeta->originating_hold_id;

                // Acyclic lock order: holds -> source PO/DA -> receiving_reports -> receiving_discrepancies -> ActionReceipt -> evidence -> RM sequence late -> inventory participant.
                $hold = null;
                if ($holdId !== null) {
                    $hold = ReceivingHold::where('chapter_id', $chapterId)->whereKey($holdId)->sharedLock()->first();
                    if ($hold === null && $rmId === null) {
                        if ($existing = (clone $receipts)->sharedLock()->first()) {
                            return $this->replay($existing, $fingerprint);
                        }
                        throw self::notFound();
                    }
                }

                $lockSourceExclusive = $operation === 'postReceivingReport';
                $source = $this->lockSource($chapterId, $sourceKind, $sourceId, $lockSourceExclusive);
                if ($source === null) {
                    if ($existing = (clone $receipts)->sharedLock()->first()) {
                        return $this->replay($existing, $fingerprint);
                    }
                    throw self::notFound();
                }

                $rm = $rmId === null
                    ? new ReceivingReport([
                        'id' => (string) Str::uuid(),
                        'chapter_id' => $chapterId,
                        'status' => 'draft',
                        'version' => 1,
                        'material_version' => 1,
                        'source_kind' => $sourceKind,
                        'source_id' => $sourceId,
                        'prepared_by' => $actorId,
                    ])
                    : (ReceivingReport::where('chapter_id', $chapterId)->whereKey($rmId)->lockForUpdate()->first() ?? throw self::notFound());

                if ($rmId !== null) {
                    $rm->load(self::RELATIONS);
                    $before = ReceivingResource::report($rm);
                }

                $discrepancyIds = $this->collectReferencedDiscrepancyIds($operation, $input, $rm);
                $lockedDiscrepancies = $discrepancyIds === []
                    ? collect()
                    : ReceivingDiscrepancy::where('chapter_id', $chapterId)
                        ->whereIn('id', $discrepancyIds)
                        ->orderBy('id')
                        ->sharedLock()
                        ->get()
                        ->keyBy('id');

                if ($existing = (clone $receipts)->sharedLock()->first()) {
                    return $this->replay($existing, $fingerprint);
                }

                if ($rmId !== null && ((int) $rm->version !== $input['expected_version'] || (int) $rm->material_version !== $input['expected_material_version'])) {
                    throw self::conflict('version_conflict', 'Read the current Receiving Report before trying again.', $before);
                }

                $now = now('UTC')->toImmutable();
                $nowIso = RepfResource::instant($now);
                $actor = RepfResource::actor($actorUser);
                $operationId = (string) Str::uuid();
                $fromStatus = $rmId === null ? null : $rm->status;
                $evidenceInvalidated = false;
                $pendingLines = null;
                $postingSummary = null;
                $coEmitLotIds = [];
                $createdDiscrepancies = [];
                $sourceUpdated = false;
                $sourceFromStatus = $source->status;

                switch ($operation) {
                    case 'createReceivingReport':
                        $pendingLines = $this->applyDraft($rm, $source, $hold, $chapterId, $input, $now, isNew: true, lockedDiscrepancies: $lockedDiscrepancies);
                        break;

                    case 'replaceReceivingReport':
                        if (! in_array($rm->status, ['draft', 'inspected', 'evidence_matched'], true)) {
                            throw self::conflict('invalid_transition', 'Only draft, inspected, or evidence-matched Receiving Reports can be replaced.', $before);
                        }
                        $evidenceInvalidated = $rm->evidence_acknowledgment !== null;
                        if ($rm->status !== 'draft') {
                            $this->evidence->invalidateActiveForTarget($chapterId, $this->evidencePurpose($rm->source_kind), $rm->id);
                        }
                        $pendingLines = $this->applyDraft($rm, $source, $hold, $chapterId, $input, $now, isNew: false, lockedDiscrepancies: $lockedDiscrepancies);
                        $rm->status = 'draft';
                        $rm->inspection = null;
                        $rm->snapshot_sha256 = null;
                        $rm->evidence_acknowledgment = null;
                        break;

                    case 'inspectReceivingReport':
                        if ($rm->status !== 'draft') {
                            throw self::conflict('invalid_transition', 'Only draft Receiving Reports can be inspected.', $before);
                        }
                        $pendingLines = $this->inspect($rm, $source, $chapterId, $actor, $input, $now, $lockedDiscrepancies);
                        break;

                    case 'matchReceivingReportEvidence':
                        if ($rm->status !== 'inspected') {
                            throw self::conflict('invalid_transition', 'Only inspected Receiving Reports can match signed paper evidence.', $before);
                        }
                        $this->matchEvidence($rm, $chapterId, $actorId, $input, $nowIso, $before);
                        break;

                    case 'postReceivingReport':
                        if ($rm->status !== 'evidence_matched') {
                            throw self::conflict('invalid_transition', 'Only evidence-matched Receiving Reports can be posted.', $before);
                        }
                        [$postingSummary, $coEmitLotIds, $createdDiscrepancies] = $this->post(
                            $rm, $source, $chapterId, $actorId, $actor, $operationId, $input, $now, $before, $lockedDiscrepancies
                        );
                        $sourceUpdated = true;
                        break;

                    case 'cancelReceivingReport':
                        if (! in_array($rm->status, ['draft', 'inspected', 'evidence_matched'], true)) {
                            throw self::conflict('invalid_transition', 'Only unposted Receiving Reports can be canceled.', $before);
                        }
                        $evidenceInvalidated = $rm->evidence_acknowledgment !== null;
                        if ($evidenceInvalidated) {
                            $this->evidence->invalidateActiveForTarget($chapterId, $this->evidencePurpose($rm->source_kind), $rm->id);
                        }
                        $rm->status = 'canceled';
                        $rm->cancellation_json = [
                            'canceled_by' => $actor,
                            'canceled_at' => $nowIso,
                            'cancel_reason' => $input['reason'],
                        ];
                        break;
                }

                if ($rmId !== null) {
                    $rm->version++;
                }
                $rm->updated_at = $now;
                $rm->save();

                if ($pendingLines !== null) {
                    $rm->lines()->delete();
                    $rm->lines()->createMany($pendingLines);
                }

                $rm->load(self::RELATIONS);

                if ($operation === 'inspectReceivingReport') {
                    $rm->snapshot_sha256 = CanonicalJson::sha256(ReceivingResource::reportEvidenceMaterial($rm));
                    $rm->save();
                }

                $snapshot = ReceivingResource::report($rm);
                $statusCode = $operation === 'createReceivingReport' ? 201 : 200;
                $result = [
                    'data' => [
                        'operation_id' => $operationId,
                        'chapter_id' => $chapterId,
                        'actor_id' => $actorId,
                        'operation_name' => $operation,
                        'action_key' => $scope['key'],
                        'resource_kind' => 'receiving_report',
                        'resource_id' => $rm->id,
                        'committed_version' => (int) $rm->version,
                        'committed_material_version' => (int) $rm->material_version,
                        'status_code' => $statusCode,
                        'committed_at' => $nowIso,
                        'outcome' => 'committed',
                        'result' => $snapshot,
                        'posting' => $postingSummary,
                    ],
                ];

                ActionReceipt::create($scope + [
                    'id' => $operationId,
                    'fingerprint' => $fingerprint,
                    'status' => $statusCode,
                    'result' => $result,
                ]);

                $history = self::history($rm);
                $history->create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $chapterId,
                    'record_kind' => 'receiving_report',
                    'record_id' => $rm->id,
                    'sequence_no' => ((int) (clone $history)->max('sequence_no')) + 1,
                    'version' => (int) $rm->version,
                    'material_version' => (int) $rm->material_version,
                    'is_version_snapshot' => true,
                    'event_type' => self::HISTORY_ACTIONS[$operation],
                    'actor_user_id' => $actorId,
                    'reason' => $input['reason'] ?? null,
                    'snapshot_json' => $snapshot,
                    'operation_json' => [
                        'operation_id' => $operationId,
                        'from_status' => $fromStatus,
                        'actor' => $actor,
                        'evidence_binding_invalidated' => $evidenceInvalidated,
                    ],
                    'recorded_at' => $now,
                ]);

                $this->outbox->recordIntent('stage2.receiving-report.changed.v1', $chapterId, $rm->id, (int) $rm->version, (int) $rm->material_version);

                if ($sourceUpdated) {
                    $this->recordSourceHistoryAndOutbox($source, $sourceKind, $sourceFromStatus, $rm, $chapterId, $actorId, $actor, $operationId, $now);
                }

                foreach ($createdDiscrepancies as $discrepancy) {
                    $discrepancy->setRelation('receivingReport', $rm);
                    ReceivingExceptionWorkflow::recordDiscrepancyHistory(
                        ReceivingResource::discrepancy($discrepancy), $actorId, $operationId, $now, 'opened', $discrepancy->discrepancy_notes,
                    );
                    $this->outbox->recordIntent(
                        'stage2.receiving-discrepancy.changed.v1',
                        $chapterId,
                        $discrepancy->id,
                        (int) $discrepancy->version,
                        (int) $discrepancy->material_version,
                    );
                }

                if ($coEmitLotIds !== []) {
                    $lots = InventoryLot::where('chapter_id', $chapterId)
                        ->whereIn('id', $coEmitLotIds)
                        ->orderBy('id')
                        ->sharedLock()
                        ->get(['id', 'stock_version', 'material_version'])
                        ->keyBy('id');
                    foreach ($coEmitLotIds as $lotId) {
                        $lot = $lots->get($lotId);
                        $this->outbox->recordIntent(
                            'stage1.stock-lot.changed.v1',
                            $chapterId,
                            $lotId,
                            max(1, (int) ($lot?->stock_version ?? $rm->posting_stock_version ?? 1)),
                            max(1, (int) ($lot?->material_version ?? 1)),
                        );
                    }
                }

                return response()->json($result, $statusCode, ['X-Action-Replayed' => 'false']);
            });
        } catch (UniqueConstraintViolationException $exception) {
            $existing = (clone $receipts)->sharedLock()->first();
            if ($existing === null) {
                throw $exception;
            }

            return $this->replay($existing, $fingerprint);
        } catch (ContractException $exception) {
            if ($exception->statusCode !== 409) {
                throw $exception;
            }
            if ($exception->errorCode === 'setup_blocked' && array_key_exists('setup_blockers', $exception->extra)) {
                throw new ContractException(409, 'setup_blocked', $exception->getMessage(), [
                    'failed_intent_committed' => false,
                    'current' => $exception->extra['current'] ?? $before,
                    'setup_blockers' => $exception->extra['setup_blockers'],
                ]);
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

    /** @return list<array<string, mixed>> */
    private function applyDraft(
        ReceivingReport $rm,
        PurchaseOrder|Donation $source,
        ?ReceivingHold $hold,
        string $chapterId,
        array $input,
        CarbonImmutable $now,
        bool $isNew,
        Collection $lockedDiscrepancies,
    ): array {
        $errors = [];
        ReceivingInput::enforceDrPairForSourceKind($rm->source_kind, $input['supplier_dr_reference'], $input['supplier_dr_date'], $errors);
        if ($rm->source_kind === 'da') {
            foreach ($input['lines'] as $i => $line) {
                if ($line['resolves_discrepancy_id'] !== null) {
                    $errors[] = ReceivingInput::field("/lines/{$i}/resolves_discrepancy_id", 'invalid_format', 'resolves_discrepancy_id must be null for DA-RM.');
                }
            }
        }
        if ($errors !== []) {
            throw OpeningDraftInput::invalidInput($errors);
        }

        if ($isNew && $input['originating_hold_id'] !== null) {
            if ($hold === null || $hold->status !== 'linked_to_source'
                || $hold->source_kind !== $rm->source_kind
                || $hold->source_id !== $rm->source_id) {
                throw self::conflict('source_not_eligible', 'Originating missing-source hold must be linked_to_source for the same source.');
            }
        }

        $this->assertSourceEligible($source, $rm->source_kind, (int) $input['source_material_version']);
        $this->assertLocationValid($chapterId, $input['location_id']);

        $policy = self::effectivePolicy($chapterId, 'valuation_rounding', 'FINANCE', 'OpeningValuationPolicyValue', $now);
        $mode = self::roundingMode((string) ($policy->rules_json['rounding_mode'] ?? ''));

        [$preparedLines, $acceptedTotal, $firstResolvesId] = $this->prepareLines($chapterId, $source, $rm->source_kind, $input['lines'], $mode, $lockedDiscrepancies);

        $rm->fill([
            'source_reference' => $this->sourceReference($source, $rm->source_kind),
            'source_material_version' => (int) $source->material_version,
            'originating_hold_id' => $isNew ? $input['originating_hold_id'] : $rm->originating_hold_id,
            'resolves_discrepancy_id' => $firstResolvesId,
            'location_id' => $input['location_id'],
            'supplier_dr_reference' => $input['supplier_dr_reference'],
            'supplier_dr_date' => $input['supplier_dr_date'],
            'accepted_total_value_php' => $acceptedTotal,
        ]);

        if ($isNew) {
            $rm->created_at = $now;
        } else {
            $rm->material_version++;
        }

        return $preparedLines;
    }

    /** @return list<array<string, mixed>> */
    private function inspect(
        ReceivingReport $rm,
        PurchaseOrder|Donation $source,
        string $chapterId,
        array $actor,
        array $input,
        CarbonImmutable $now,
        Collection $lockedDiscrepancies,
    ): array {
        if ($rm->source_kind === 'da') {
            $errors = [];
            foreach ($input['lines'] as $i => $line) {
                if ($line['resolves_discrepancy_id'] !== null) {
                    $errors[] = ReceivingInput::field("/lines/{$i}/resolves_discrepancy_id", 'invalid_format', 'resolves_discrepancy_id must be null for DA-RM.');
                }
            }
            if ($errors !== []) {
                throw OpeningDraftInput::invalidInput($errors);
            }
        }

        $this->assertSourceEligible($source, $rm->source_kind, (int) $input['source_material_version']);
        $this->assertLocationValid($chapterId, $rm->location_id);

        $repActor = null;
        if ($input['technical_or_requesting_representative_id'] !== null) {
            $repId = $input['technical_or_requesting_representative_id'];
            $repMembership = ChapterMembership::where('chapter_id', $chapterId)
                ->where('user_id', $repId)
                ->current()
                ->sharedLock()
                ->first();
            $repUser = $repMembership ? User::whereKey($repId)->sharedLock()->first() : null;
            if (! $repUser || ! in_array($repUser->status, ['active', 'enabled'], true)) {
                throw self::notFound();
            }
            $repActor = RepfResource::actor($repUser);
        }

        $policy = self::effectivePolicy($chapterId, 'valuation_rounding', 'FINANCE', 'OpeningValuationPolicyValue', $now);
        $mode = self::roundingMode((string) ($policy->rules_json['rounding_mode'] ?? ''));

        [$preparedLines, $acceptedTotal, $firstResolvesId] = $this->prepareLines($chapterId, $source, $rm->source_kind, $input['lines'], $mode, $lockedDiscrepancies);

        $rm->source_reference = $this->sourceReference($source, $rm->source_kind);
        $rm->source_material_version = (int) $source->material_version;
        $rm->resolves_discrepancy_id = $firstResolvesId;
        $rm->accepted_total_value_php = $acceptedTotal;
        $rm->inspection = [
            'inspector' => $actor,
            'technical_or_requesting_representative' => $repActor,
            'inspected_at' => $input['inspected_at'],
            'inspection_notes' => $input['inspection_notes'],
        ];
        $rm->status = 'inspected';

        return $preparedLines;
    }

    private function matchEvidence(
        ReceivingReport $rm,
        string $chapterId,
        string $actorId,
        array $input,
        string $nowIso,
        ?array $before,
    ): void {
        $computedSha = CanonicalJson::sha256(ReceivingResource::reportEvidenceMaterial($rm));
        if ($rm->snapshot_sha256 === null || ! hash_equals($rm->snapshot_sha256, $computedSha) || ! hash_equals($rm->snapshot_sha256, $input['snapshot_sha256'])) {
            throw self::conflict('evidence_mismatch', 'The submitted snapshot hash does not match the inspected Receiving Report.', $before);
        }

        $snapshot = [
            'target' => [
                'purpose' => $this->evidencePurpose($rm->source_kind),
                'record_id' => $rm->id,
            ],
            'material_version' => (int) $rm->material_version,
            'sha256' => $rm->snapshot_sha256,
        ];
        $ackPayload = [
            'acknowledgment_id' => (string) Str::uuid(),
            'matched_by' => $actorId,
            'matched_at' => $nowIso,
            'recipient_id' => null,
            'acknowledged_at' => $input['acknowledged_at'],
            'snapshot' => $snapshot,
            'bytes' => $input['evidence'],
        ];

        $this->evidence->verifyMatch($chapterId, $actorId, $snapshot, $input['evidence'], $ackPayload, $before);

        $rm->evidence_acknowledgment = $ackPayload;
        $rm->status = 'evidence_matched';
    }

    /** @return array{array<string, mixed>, list<string>, list<ReceivingDiscrepancy>} */
    private function post(
        ReceivingReport $rm,
        PurchaseOrder|Donation $source,
        string $chapterId,
        string $actorId,
        array $actor,
        string $operationId,
        array $input,
        CarbonImmutable $now,
        ?array $before,
        Collection $lockedDiscrepancies,
    ): array {
        if ((int) $rm->source_material_version !== (int) $input['source_material_version']
            || (int) $source->material_version !== (int) $input['source_material_version']) {
            throw self::conflict('version_conflict', 'Source document changed; revise and re-inspect the Receiving Report before posting.', $before);
        }

        $this->assertSourceEligible($source, $rm->source_kind, (int) $input['source_material_version']);
        $this->assertLocationValid($chapterId, $rm->location_id);

        $ack = $rm->evidence_acknowledgment;
        if (! is_array($ack) || empty($ack['acknowledgment_id'])) {
            throw self::conflict('acknowledgment_missing', 'Signed paper evidence match is required before posting.', $before);
        }
        if ($ack['acknowledgment_id'] !== $input['acknowledgment_id']) {
            throw self::conflict('evidence_mismatch', 'The supplied acknowledgment_id does not match the active evidence match.', $before);
        }

        $policy = self::effectivePolicy($chapterId, 'valuation_rounding', 'FINANCE', 'OpeningValuationPolicyValue', $now);
        $mode = self::roundingMode((string) ($policy->rules_json['rounding_mode'] ?? ''));

        $sourceLines = $source->lines->keyBy('id');
        $variants = CatalogueVariant::where('chapter_id', $chapterId)
            ->whereIn('id', $rm->lines->pluck('variant_id'))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');
        $items = CatalogueItem::where('chapter_id', $chapterId)
            ->whereIn('id', $variants->pluck('item_id'))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');
        $units = CatalogueUnit::where('chapter_id', $chapterId)
            ->whereIn('id', $rm->lines->pluck('unit_id'))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');

        $recomputedTotals = [];
        $participantLines = [];
        foreach ($rm->lines as $line) {
            $sourceLine = $sourceLines->get($line->source_line_id);
            if (! $sourceLine) {
                throw self::conflict('source_not_eligible', 'Source line no longer exists on the source document.', $before);
            }
            if ($line->variant_id !== $sourceLine->variant_id || $line->unit_id !== $sourceLine->unit_id) {
                throw self::conflict('substitution_or_overdelivery_blocked', 'Variant or unit substitution is blocked without an approved amendment.', $before);
            }
            $variant = $variants->get($line->variant_id);
            $item = $variant ? $items->get($variant->item_id) : null;
            $unit = $units->get($line->unit_id);
            if (! $variant || ! $item || ! $unit
                || $variant->state !== 'active' || ! $variant->is_active
                || $item->state !== 'active' || ! $item->is_active
                || $unit->id !== $variant->unit_id || $unit->state !== 'active'
                || (int) $variant->quantity_scale !== (int) $line->quantity_scale) {
                throw self::conflict('version_conflict', 'Active variant, unit, or quantity scale changed; replace and re-inspect the RM.', $before);
            }

            $scale = (int) $line->quantity_scale;
            $delivered = BigDecimal::of($line->delivered_quantity);
            $accepted = BigDecimal::of($line->accepted_quantity);
            $damaged = BigDecimal::of($line->damaged_quantity);
            $rejected = BigDecimal::of($line->rejected_quantity);
            $outstanding = BigDecimal::of($sourceLine->outstanding_quantity);

            if ($delivered->isGreaterThan($outstanding)) {
                throw self::conflict('substitution_or_overdelivery_blocked', 'Delivered quantity exceeds the live source outstanding quantity.', $before);
            }

            $expectedUnitPhp = $rm->source_kind === 'po' ? (string) $sourceLine->unit_price_php : (string) $sourceLine->unit_value_php;
            if (BigDecimal::of($line->unit_valuation_php)->compareTo($expectedUnitPhp) !== 0) {
                throw self::conflict('version_conflict', 'Source unit valuation changed; replace and re-inspect the RM.', $before);
            }

            $recomputedAcceptedValue = $accepted->multipliedBy($line->unit_valuation_php)->toScale(2, $mode);
            if ((string) $recomputedAcceptedValue !== (string) $line->accepted_value_php) {
                throw self::conflict('version_conflict', 'Effective valuation rounding changed line values; replace and re-inspect the RM.', $before);
            }
            $recomputedTotals[] = $recomputedAcceptedValue;

            if ($line->resolves_discrepancy_id !== null) {
                $this->assertValidResolvesDiscrepancy($lockedDiscrepancies, $line->resolves_discrepancy_id, $source->id, $sourceLine->id);
            }

            $label = trim(($item->name ?? '').' — '.($variant->name ?? $variant->label ?? $variant->code ?? $variant->sku ?? 'Variant'));
            $participantLines[] = [
                'rm_line_id' => $line->id,
                'source_line_id' => $line->source_line_id,
                'variant_id' => $variant->id,
                'variant_material_version' => max(1, (int) ($variant->material_version ?? 1)),
                'item_id' => $item->id,
                'unit_id' => $unit->id,
                'unit_material_version' => max(1, (int) ($unit->material_version ?? 1)),
                'quantity_scale' => $scale,
                'historical_variant_label' => mb_substr($label, 0, 200),
                'delivered_quantity' => (string) $delivered->toScale($scale),
                'accepted_quantity' => (string) $accepted->toScale($scale),
                'damaged_quantity' => (string) $damaged->toScale($scale),
                'rejected_quantity' => (string) $rejected->toScale($scale),
                'unit_valuation_php' => (string) $line->unit_valuation_php,
                'restrictions' => $rm->source_kind === 'da' ? ($sourceLine->restrictions ?? ReceivingResource::UNRESTRICTED) : ReceivingResource::UNRESTRICTED,
                'discrepancy_notes' => $line->discrepancy_notes,
                'resolves_discrepancy_id' => $line->resolves_discrepancy_id,
            ];
        }

        if ((string) BigDecimal::sum(...$recomputedTotals)->toScale(2) !== (string) $rm->accepted_total_value_php) {
            throw self::conflict('version_conflict', 'Effective valuation rounding changed total accepted value; replace and re-inspect the RM.', $before);
        }

        $computedSha = CanonicalJson::sha256(ReceivingResource::reportEvidenceMaterial($rm));
        if ($rm->snapshot_sha256 === null || ! hash_equals($rm->snapshot_sha256, $computedSha)) {
            throw self::conflict('evidence_mismatch', 'Receiving Report material no longer matches its frozen snapshot.', $before);
        }
        $snapshot = [
            'target' => [
                'purpose' => $this->evidencePurpose($rm->source_kind),
                'record_id' => $rm->id,
            ],
            'material_version' => (int) $rm->material_version,
            'sha256' => $rm->snapshot_sha256,
        ];
        $this->evidence->verifyMatch($chapterId, $actorId, $snapshot, $ack['bytes'] ?? null, $ack, $before);

        DB::table('chapter_opening_guards')->insertOrIgnore([
            'chapter_id' => $chapterId,
            'stock_version' => 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $guard = ChapterOpeningGuard::where('chapter_id', $chapterId)->lockForUpdate()->firstOrFail();

        // Allocate shared yearly RM sequence LATE inside the commit transaction.
        $seq = $this->sequences->nextReference($chapterId, 'RM', requireApprovedPolicy: true);
        $rmReference = $seq['reference'];

        $participantInput = [
            'actor_id' => $actorId,
            'chapter_id' => $chapterId,
            'operation_id' => $operationId,
            'source_kind' => $rm->source_kind === 'po' ? 'po_rm' : 'da_rm',
            'rm_id' => $rm->id,
            'rm_reference' => $rmReference,
            'rm_material_version' => (int) $rm->material_version,
            'source_id' => $rm->source_id,
            'source_reference' => $rm->source_reference,
            'source_material_version' => (int) $rm->source_material_version,
            'donor_id' => null,
            'donor_name' => $source instanceof Donation ? $source->donor_name : null,
            'location_id' => $rm->location_id,
            'current_stock_version' => max(1, (int) $guard->stock_version),
            'acknowledgment' => $ack,
            'lines' => $participantLines,
        ];

        $outcome = $this->inventory->prepareReceivingInventory($participantInput);
        if (($outcome['outcome'] ?? null) === 'rejected') {
            $reason = (string) ($outcome['reason'] ?? 'target_locked');
            if ($reason === 'authority_changed') {
                throw new ContractException(403, 'duty_denied', 'Current authority changed during receiving posting.');
            }
            $code = $reason === 'stale_version' ? 'version_conflict' : $reason;
            throw self::conflict($code, 'Receiving inventory posting was rejected.', $before);
        }
        if (($outcome['outcome'] ?? null) !== 'ready' || ! is_int($outcome['stock_version'] ?? null)) {
            throw new ContractException(503, 'unavailable', 'Receiving inventory participant is unavailable.');
        }

        $guard->stock_version = (int) $outcome['stock_version'];
        $guard->updated_at = $now;
        $guard->save();

        $rm->rm_reference = $rmReference;
        $rm->status = 'posted';
        $rm->posted_by = $actorId;
        $rm->posted_at = $now;
        $rm->posting_stock_version = (int) $outcome['stock_version'];

        $rmLinesById = $rm->lines->keyBy('id');
        $createdDiscrepancies = [];
        $createdDiscrepancyIds = [];
        foreach ((array) ($outcome['created_discrepancies'] ?? []) as $seed) {
            $rmLine = $rmLinesById->get($seed['rm_line_id']);
            $scale = (int) ($rmLine?->quantity_scale ?? 0);
            $discrepancy = ReceivingDiscrepancy::create([
                'id' => $seed['discrepancy_id'],
                'chapter_id' => $chapterId,
                'status' => 'open',
                'version' => 1,
                'material_version' => 1,
                'source_kind' => $rm->source_kind,
                'source_id' => $rm->source_id,
                'source_line_id' => $seed['source_line_id'],
                'rm_id' => $rm->id,
                'rm_line_id' => $seed['rm_line_id'],
                'variant_id' => $seed['variant_id'],
                'unit_id' => $seed['unit_id'],
                'quantity_scale' => $scale,
                'damaged_quantity' => $seed['damaged_quantity'],
                'rejected_quantity' => $seed['rejected_quantity'],
                'quarantined_lot_id' => $seed['quarantined_lot_id'] ?? null,
                'rejected_lot_id' => $seed['rejected_lot_id'] ?? null,
                'discrepancy_notes' => $rmLine?->discrepancy_notes ?? 'Receiving discrepancy recorded.',
                'quarantined_lots_auto_cleared_on_source_close' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $createdDiscrepancies[] = $discrepancy;
            $createdDiscrepancyIds[] = $discrepancy->id;
        }

        $sourceStatusAfter = $this->applySourceProgress($source, $rm, $now);

        $usableLotIds = array_values(array_unique(array_column((array) ($outcome['usable_lots'] ?? []), 'lot_id')));
        $quarantinedOrRejectedLotIds = array_values(array_unique(array_column((array) ($outcome['quarantined_or_rejected_lots'] ?? []), 'lot_id')));
        $coEmitLotIds = array_values(array_unique([...$usableLotIds, ...$quarantinedOrRejectedLotIds]));

        $summary = [
            'stock_version' => (int) $outcome['stock_version'],
            'usable_lot_ids' => $usableLotIds,
            'quarantined_or_rejected_lot_ids' => $quarantinedOrRejectedLotIds,
            'created_discrepancy_ids' => array_values(array_unique($createdDiscrepancyIds)),
            'source_status_after' => $sourceStatusAfter,
        ];

        return [$summary, $coEmitLotIds, $createdDiscrepancies];
    }

    private function applySourceProgress(PurchaseOrder|Donation $source, ReceivingReport $rm, CarbonImmutable $now): string
    {
        $sourceLines = $source->lines->keyBy('id');

        if ($source instanceof PurchaseOrder) {
            foreach ($rm->lines as $rmLine) {
                $poLine = $sourceLines->get($rmLine->source_line_id);
                $scale = (int) $poLine->quantity_scale;
                $newAccepted = BigDecimal::of($poLine->accepted_quantity)->plus($rmLine->accepted_quantity)->toScale($scale);
                $discrepantDelta = BigDecimal::of($rmLine->damaged_quantity)->plus($rmLine->rejected_quantity);
                $newDiscrepant = BigDecimal::of($poLine->rejected_or_disputed_quantity)->plus($discrepantDelta)->toScale($scale);
                $newOutstanding = BigDecimal::of($poLine->ordered_quantity)
                    ->minus($newAccepted)
                    ->minus($poLine->closed_short_quantity)
                    ->minus($poLine->canceled_quantity)
                    ->toScale($scale);

                $poLine->accepted_quantity = (string) $newAccepted;
                $poLine->rejected_or_disputed_quantity = (string) $newDiscrepant;
                $poLine->outstanding_quantity = (string) $newOutstanding;
                $poLine->save();
            }

            $allZero = $source->lines->every(fn ($line) => BigDecimal::of($line->outstanding_quantity)->isZero());
            $anyAccepted = $source->lines->contains(fn ($line) => BigDecimal::of($line->accepted_quantity)->isPositive());
            $nextStatus = $allZero ? 'receiving_complete' : ($anyAccepted ? 'partially_received' : $source->status);

            $source->status = $nextStatus;
            $source->version++;
            $source->updated_at = $now;
            $source->save();

            return $nextStatus;
        }

        foreach ($rm->lines as $rmLine) {
            $daLine = $sourceLines->get($rmLine->source_line_id);
            $scale = (int) $daLine->quantity_scale;
            $newReceived = BigDecimal::of($daLine->received_quantity)->plus($rmLine->accepted_quantity)->toScale($scale);
            $newOutstanding = BigDecimal::of($daLine->pledged_quantity)
                ->minus($newReceived)
                ->minus($daLine->closed_short_quantity)
                ->toScale($scale);

            $daLine->received_quantity = (string) $newReceived;
            $daLine->outstanding_quantity = (string) $newOutstanding;
            $daLine->save();
        }

        $allZero = $source->lines->every(fn ($line) => BigDecimal::of($line->outstanding_quantity)->isZero());
        $anyReceived = $source->lines->contains(fn ($line) => BigDecimal::of($line->received_quantity)->isPositive());
        $nextStatus = $allZero ? 'received' : ($anyReceived ? 'partially_received' : $source->status);

        $source->status = $nextStatus;
        $source->version++;
        $source->updated_at = $now;
        $source->save();

        return $nextStatus;
    }

    private function recordSourceHistoryAndOutbox(
        PurchaseOrder|Donation $source,
        string $sourceKind,
        string $sourceFromStatus,
        ReceivingReport $rm,
        string $chapterId,
        string $actorId,
        array $actor,
        string $operationId,
        CarbonImmutable $now,
    ): void {
        if ($source instanceof PurchaseOrder) {
            $source->load(PurchaseOrderWorkflow::RELATIONS);
            $history = PurchaseOrderWorkflow::history($source);
            $history->create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $chapterId,
                'record_kind' => 'purchase_order',
                'record_id' => $source->id,
                'sequence_no' => ((int) (clone $history)->max('sequence_no')) + 1,
                'version' => (int) $source->version,
                'material_version' => (int) $source->material_version,
                'is_version_snapshot' => true,
                'event_type' => 'po_receiving_progress',
                'actor_user_id' => $actorId,
                'reason' => null,
                'snapshot_json' => PurchaseOrderResource::format($source, null, false),
                'operation_json' => [
                    'operation_id' => $operationId,
                    'from_status' => $sourceFromStatus,
                    'actor' => $actor,
                    'rm_id' => $rm->id,
                    'rm_reference' => $rm->rm_reference,
                ],
                'recorded_at' => $now,
            ]);
            $this->outbox->recordIntent('stage2.purchase-order.changed.v1', $chapterId, $source->id, (int) $source->version, (int) $source->material_version);

            return;
        }

        $source->load('lines');
        $history = DonationWorkflow::history($source);
        $history->create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapterId,
            'record_kind' => 'donation',
            'record_id' => $source->id,
            'sequence_no' => ((int) (clone $history)->max('sequence_no')) + 1,
            'version' => (int) $source->version,
            'material_version' => (int) $source->material_version,
            'is_version_snapshot' => true,
            'event_type' => 'postReceivingReport',
            'actor_user_id' => $actorId,
            'reason' => null,
            'snapshot_json' => DonationResource::format($source, true),
            'operation_json' => [
                'operation_id' => $operationId,
                'restriction_resolution' => null,
                'rm_id' => $rm->id,
                'rm_reference' => $rm->rm_reference,
            ],
            'recorded_at' => $now,
        ]);
        $this->outbox->recordIntent('stage2.donation.changed.v1', $chapterId, $source->id, (int) $source->version, (int) $source->material_version);
    }

    /** @return array{list<array<string, mixed>>, string, ?string} */
    private function prepareLines(
        string $chapterId,
        PurchaseOrder|Donation $source,
        string $sourceKind,
        array $inputLines,
        RoundingMode $mode,
        Collection $lockedDiscrepancies,
    ): array {
        $sourceLines = $source->lines->keyBy('id');
        $variants = CatalogueVariant::where('chapter_id', $chapterId)
            ->whereIn('id', $source->lines->pluck('variant_id'))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');
        $items = CatalogueItem::where('chapter_id', $chapterId)
            ->whereIn('id', $variants->pluck('item_id'))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');
        $units = CatalogueUnit::where('chapter_id', $chapterId)
            ->whereIn('id', $source->lines->pluck('unit_id'))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');

        $prepared = [];
        $acceptedValues = [];
        $firstResolvesId = null;

        foreach ($inputLines as $index => $line) {
            $sourceLine = $sourceLines->get($line['source_line_id']) ?? throw self::notFound();
            if ($line['variant_id'] !== $sourceLine->variant_id || $line['unit_id'] !== $sourceLine->unit_id) {
                throw self::conflict('substitution_or_overdelivery_blocked', 'Variant or unit substitution is blocked without an approved amendment.');
            }

            $variant = $variants->get($sourceLine->variant_id);
            $item = $variant ? $items->get($variant->item_id) : null;
            $unit = $units->get($sourceLine->unit_id);
            if (! $variant || ! $item || ! $unit
                || $variant->state !== 'active' || ! $variant->is_active
                || $item->state !== 'active' || ! $item->is_active
                || $unit->id !== $variant->unit_id || $unit->state !== 'active') {
                throw OpeningDraftInput::invalidInput([
                    ReceivingInput::field("/lines/{$index}/variant_id", 'invalid_format', 'The selected catalogue variant and unit must be active.'),
                ]);
            }

            $scale = (int) $sourceLine->quantity_scale;
            if ((int) $variant->quantity_scale !== $scale) {
                throw self::conflict('version_conflict', 'Active variant quantity scale changed since the source document was approved.');
            }

            foreach (['delivered_quantity', 'accepted_quantity', 'damaged_quantity', 'rejected_quantity'] as $field) {
                $rawQty = (string) $line[$field];
                $dec = BigDecimal::of($rawQty);
                if ($dec->getScale() > $scale || ($scale === 0 && str_contains($rawQty, '.'))) {
                    throw OpeningDraftInput::invalidInput([
                        ReceivingInput::field("/lines/{$index}/{$field}", 'invalid_format', "{$field} exceeds the approved variant quantity scale."),
                    ]);
                }
            }

            $delivered = BigDecimal::of($line['delivered_quantity']);
            $accepted = BigDecimal::of($line['accepted_quantity']);
            $damaged = BigDecimal::of($line['damaged_quantity']);
            $rejected = BigDecimal::of($line['rejected_quantity']);
            $outstanding = BigDecimal::of($sourceLine->outstanding_quantity);

            if ($delivered->isGreaterThan($outstanding)) {
                throw self::conflict('substitution_or_overdelivery_blocked', 'Delivered quantity exceeds the live source outstanding quantity.');
            }

            $expectedUnitPhp = $sourceKind === 'po' ? (string) $sourceLine->unit_price_php : (string) $sourceLine->unit_value_php;
            if (BigDecimal::of($line['unit_valuation_php'])->compareTo($expectedUnitPhp) !== 0) {
                throw OpeningDraftInput::invalidInput([
                    ReceivingInput::field("/lines/{$index}/unit_valuation_php", 'invalid_format', 'unit_valuation_php must match the approved source line unit valuation.'),
                ]);
            }

            if ($line['resolves_discrepancy_id'] !== null) {
                $this->assertValidResolvesDiscrepancy($lockedDiscrepancies, $line['resolves_discrepancy_id'], $source->id, $sourceLine->id);
                $firstResolvesId ??= $line['resolves_discrepancy_id'];
            }

            $acceptedValue = $accepted->multipliedBy($line['unit_valuation_php'])->toScale(2, $mode);
            if ($acceptedValue->isGreaterThan(self::MAX_PHP)) {
                throw OpeningDraftInput::invalidInput([
                    ReceivingInput::field("/lines/{$index}/unit_valuation_php", 'invalid_format', 'Line accepted value exceeds the supported maximum.'),
                ]);
            }
            $acceptedValues[] = $acceptedValue;

            $prepared[] = [
                'id' => (string) Str::uuid(),
                'source_line_id' => $sourceLine->id,
                'line_number' => $index + 1,
                'variant_id' => $sourceLine->variant_id,
                'unit_id' => $sourceLine->unit_id,
                'quantity_scale' => $scale,
                'delivered_quantity' => (string) $delivered->toScale($scale),
                'accepted_quantity' => (string) $accepted->toScale($scale),
                'damaged_quantity' => (string) $damaged->toScale($scale),
                'rejected_quantity' => (string) $rejected->toScale($scale),
                'unit_valuation_php' => $line['unit_valuation_php'],
                'accepted_value_php' => (string) $acceptedValue,
                'restrictions' => $sourceKind === 'da' ? ($sourceLine->restrictions ?? ReceivingResource::UNRESTRICTED) : ReceivingResource::UNRESTRICTED,
                'discrepancy_notes' => $line['discrepancy_notes'],
                'resolves_discrepancy_id' => $line['resolves_discrepancy_id'],
            ];
        }

        $total = BigDecimal::sum(...$acceptedValues)->toScale(2);
        if ($total->isGreaterThan(self::MAX_PHP)) {
            throw OpeningDraftInput::invalidInput([
                ReceivingInput::field('/lines', 'invalid_format', 'Accepted total value exceeds the supported maximum.'),
            ]);
        }

        return [$prepared, (string) $total, $firstResolvesId];
    }

    private function assertValidResolvesDiscrepancy(Collection $lockedDiscrepancies, string $discrepancyId, string $sourceId, string $sourceLineId): void
    {
        /** @var ReceivingDiscrepancy|null $discrepancy */
        $discrepancy = $lockedDiscrepancies->get($discrepancyId);
        if (! $discrepancy) {
            throw self::notFound();
        }
        if ($discrepancy->source_kind !== 'po'
            || $discrepancy->source_id !== $sourceId
            || $discrepancy->source_line_id !== $sourceLineId
            || ! in_array($discrepancy->status, ['open', 'supplier_notified', 'under_review'], true)) {
            throw self::conflict('source_not_eligible', 'The referenced PO discrepancy is not eligible for replacement.');
        }
    }

    private function assertSourceEligible(PurchaseOrder|Donation $source, string $sourceKind, int $expectedSourceMaterialVersion): void
    {
        $eligible = $sourceKind === 'po'
            ? in_array($source->status, ['issued', 'partially_received'], true)
            : in_array($source->status, ['acknowledged', 'partially_received'], true);

        if (! $eligible) {
            throw self::conflict('source_not_eligible', 'The source document is not eligible for receiving.');
        }
        if ((int) $source->material_version !== $expectedSourceMaterialVersion) {
            throw self::conflict('version_conflict', 'Read the current source document version before trying again.');
        }
    }

    private function assertLocationValid(string $chapterId, string $locationId): void
    {
        $location = CatalogueLocation::where('chapter_id', $chapterId)->whereKey($locationId)->sharedLock()->first()
            ?? throw self::notFound();
        if ($location->state !== 'active') {
            throw OpeningDraftInput::invalidInput([
                ReceivingInput::field('/location_id', 'invalid_format', 'The receiving stockroom location must be active.'),
            ]);
        }
    }

    private function lockSource(string $chapterId, string $sourceKind, string $sourceId, bool $exclusive): PurchaseOrder|Donation|null
    {
        $query = $sourceKind === 'po'
            ? PurchaseOrder::where('chapter_id', $chapterId)->whereKey($sourceId)
            : Donation::where('chapter_id', $chapterId)->whereKey($sourceId);

        $source = ($exclusive ? $query->lockForUpdate() : $query->sharedLock())->first();
        if ($source !== null) {
            $source->load('lines');
        }

        return $source;
    }

    private function sourceReference(PurchaseOrder|Donation $source, string $sourceKind): string
    {
        $ref = $sourceKind === 'po' ? $source->po_reference : $source->reference;
        if (! is_string($ref) || trim($ref) === '') {
            throw self::conflict('source_not_eligible', 'The source document has no issued reference.');
        }

        return $ref;
    }

    /** @return list<string> */
    private function collectReferencedDiscrepancyIds(string $operation, array $input, ReceivingReport $rm): array
    {
        $ids = [];
        if (in_array($operation, ['createReceivingReport', 'replaceReceivingReport', 'inspectReceivingReport'], true)) {
            foreach ((array) ($input['lines'] ?? []) as $line) {
                if (is_string($line['resolves_discrepancy_id'] ?? null)) {
                    $ids[] = $line['resolves_discrepancy_id'];
                }
            }
        } elseif ($operation === 'postReceivingReport') {
            foreach ($rm->lines as $line) {
                if (is_string($line->resolves_discrepancy_id)) {
                    $ids[] = $line->resolves_discrepancy_id;
                }
            }
        }

        $ids = array_values(array_unique($ids));
        sort($ids);

        return $ids;
    }

    private function evidencePurpose(string $sourceKind): string
    {
        return $sourceKind === 'po' ? 'po_supplier_dr' : 'da_receipt';
    }

    public static function effectivePolicy(string $chapterId, string $code, string $owner, string $schema, CarbonInterface $at): PolicyRecord
    {
        $policies = PolicyRecord::where('chapter_id', $chapterId)
            ->where('policy_code', $code)
            ->orderByDesc('policy_version')
            ->orderBy('id')
            ->sharedLock()
            ->get();

        $effective = $policies->first(fn (PolicyRecord $row) => ChapterAuthority::policyState($row, $owner, $schema, at: $at) === 'effective');
        if ($effective !== null) {
            return $effective;
        }

        $blocker = ChapterAuthority::policyBlocker($policies, $code, $owner, $schema, at: $at);

        throw new ContractException(409, 'setup_blocked', 'Current approved setup is required for this action.', [
            'failed_intent_committed' => false,
            'current' => null,
            'setup_blockers' => [$blocker],
        ]);
    }

    private static function roundingMode(string $mode): RoundingMode
    {
        return match ($mode) {
            'half_up' => RoundingMode::HalfUp,
            'half_even' => RoundingMode::HalfEven,
            'down' => RoundingMode::Down,
            default => throw new ContractException(503, 'unavailable', 'Unsupported valuation rounding mode.'),
        };
    }

    private function replay(ActionReceipt $receipt, string $fingerprint): JsonResponse
    {
        if (! hash_equals($receipt->fingerprint, $fingerprint)) {
            throw self::conflict('action_key_conflict', 'Use a new action key for changed input.');
        }

        return response()->json($receipt->result, $receipt->status, ['X-Action-Replayed' => 'true']);
    }

    public static function history(ReceivingReport $rm): Builder
    {
        return Stage2RecordHistory::where('chapter_id', $rm->chapter_id)
            ->where('record_kind', 'receiving_report')
            ->where('record_id', $rm->id);
    }

    public static function conflict(string $code, string $message, ?array $current = null): ContractException
    {
        return new ContractException(409, $code, $message, [
            'failed_intent_committed' => false,
            'current' => $current,
            'setup_blockers' => [],
        ]);
    }

    public static function notFound(): ContractException
    {
        return new ContractException(404, 'resource_not_found', 'Resource not found.');
    }
}
