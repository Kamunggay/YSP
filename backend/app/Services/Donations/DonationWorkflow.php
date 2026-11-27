<?php

namespace App\Services\Donations;

use App\Exceptions\ContractException;
use App\Http\Requests\DonationInput;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Resources\DonationResource;
use App\Models\ActionReceipt;
use App\Models\CatalogueItem;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Donation;
use App\Models\DonationLine;
use App\Models\DonationRestrictionResolution;
use App\Models\InventoryLot;
use App\Models\PolicyRecord;
use App\Models\Stage2RecordHistory;
use App\Services\Authority\ChapterAuthority;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Inventory\Participants\LotRestrictionResolutionParticipant;
use App\Services\Notifications\DomainNotificationOutboxService;
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
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class DonationWorkflow
{
    public const ACTIONS = [
        'createDonation' => 'da.draft',
        'replaceDonation' => 'da.draft',
        'submitDonation' => 'da.submit',
        'acknowledgeDonation' => 'da.acknowledge',
        'returnDonation' => 'da.acknowledge',
        'declineDonation' => 'da.acknowledge',
        'reviseDonation' => 'da.draft',
        'closeShortDonation' => 'da.acknowledge',
        'cancelDonation' => 'da.cancel',
        'resolveDonationRestriction' => 'da.restriction_resolve',
    ];

    public const POLICY_DUTY_FIELDS = [
        'acknowledgeDonation' => 'acknowledge_duties',
        'returnDonation' => 'acknowledge_duties',
        'declineDonation' => 'acknowledge_duties',
        'closeShortDonation' => 'acknowledge_duties',
        'resolveDonationRestriction' => 'restriction_resolve_duties',
    ];

    public const RELATIONS = ['lines.variant.item', 'lines.unit'];

    private const MAX_PHP = '999999999999.99';

    public function __construct(
        private readonly CheckEvidenceBindingParticipant $evidence,
        private readonly ReferenceSequenceService $sequences,
        private readonly LotRestrictionResolutionParticipant $lotRestrictions,
        private readonly DomainNotificationOutboxService $outbox,
    ) {}

    public function mutate(Request $request, string $chapterId, ?string $id, string $operation, string $key, array $input): JsonResponse
    {
        if (! Str::isUuid($chapterId, 4)) {
            throw new ContractException(503, 'unavailable', 'Stage 2 notifications are unavailable for this chapter.');
        }

        $authority = $request->attributes->get(ChapterAuthority::class);
        $actorId = $request->user()->id;
        $scope = [
            'chapter_id' => $chapterId,
            'user_id' => $actorId,
            'operation' => $operation,
            'key' => $key,
            'evidence_scope' => '',
        ];
        $fingerprint = CanonicalJson::sha256([$id, $input]);
        $receipts = ActionReceipt::where($scope);
        $canReadEvidence = $authority->allows('evidence.read');
        $before = null;

        try {
            return DB::transaction(function () use (
                $chapterId, $id, $operation, $input, $scope, $fingerprint, $authority, $actorId, $receipts, $canReadEvidence, &$before
            ) {
                $da = $id === null
                    ? new Donation([
                        'id' => (string) Str::uuid(),
                        'chapter_id' => $chapterId,
                        'status' => 'draft',
                        'version' => 1,
                        'material_version' => 1,
                        'prepared_by' => $actorId,
                    ])
                    : (Donation::where('chapter_id', $chapterId)->whereKey($id)->lockForUpdate()->first() ?? throw self::notFound());

                if ($id !== null) {
                    $da->load('lines');
                    $before = DonationResource::format($da, $canReadEvidence);
                }

                if (isset(self::POLICY_DUTY_FIELDS[$operation])) {
                    self::authorizePolicyAction($authority, $operation, $da->prepared_by);
                }

                if ($existing = (clone $receipts)->sharedLock()->first()) {
                    return $this->replay($existing, $fingerprint);
                }

                if ($id !== null && ((int) $da->version !== $input['expected_version'] || (int) $da->material_version !== $input['expected_material_version'])) {
                    throw self::conflict('version_conflict', 'Read the current DA before trying again.');
                }

                $now = now('UTC')->toImmutable();
                $nowIso = DonationResource::instant($now);
                $resolutionData = null;
                $updatedLotIds = [];
                $pendingLines = null;

                match ($operation) {
                    'createDonation' => $pendingLines = $this->applyDraft($da, $chapterId, $input, $now, isNew: true),
                    'replaceDonation' => $pendingLines = $this->replaceDraft($da, $chapterId, $input, $now),
                    'submitDonation' => $this->submit($da, $chapterId, $now),
                    'acknowledgeDonation' => $this->acknowledge($da, $chapterId, $actorId, $input, $now, $nowIso, $before),
                    'returnDonation' => $this->reasonedTransition($da, ['pending_acknowledgment'], 'returned_for_revision'),
                    'declineDonation' => $this->reasonedTransition($da, ['pending_acknowledgment'], 'declined'),
                    'reviseDonation' => $this->reasonedTransition($da, ['returned_for_revision'], 'draft'),
                    'closeShortDonation' => $this->closeShort($da),
                    'cancelDonation' => $this->cancel($da, $chapterId),
                    'resolveDonationRestriction' => [$resolutionData, $updatedLotIds] = $this->resolveRestriction($da, $chapterId, $actorId, $input, $now, $nowIso, $before),
                };

                if ($id !== null) {
                    $da->version++;
                }
                $da->updated_at = $now;
                $da->save();

                if ($pendingLines !== null) {
                    $da->lines()->delete();
                    $da->lines()->createMany($pendingLines);
                }
                $da->load('lines');

                $snapshot = DonationResource::format($da, true);
                $operationId = (string) Str::uuid();
                $status = in_array($operation, ['createDonation', 'resolveDonationRestriction'], true) ? 201 : 200;
                $result = [
                    'data' => [
                        'operation_id' => $operationId,
                        'operation_name' => $operation,
                        'action_key' => $scope['key'],
                        'actor_id' => $actorId,
                        'chapter_id' => $chapterId,
                        'committed_at' => $nowIso,
                        'http_status' => $status,
                        'result' => $snapshot,
                        'restriction_resolution' => $resolutionData,
                    ],
                ];

                ActionReceipt::create($scope + [
                    'id' => $operationId,
                    'fingerprint' => $fingerprint,
                    'status' => $status,
                    'result' => $result,
                ]);

                $history = self::history($da);
                $history->create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $chapterId,
                    'record_kind' => 'donation',
                    'record_id' => $da->id,
                    'sequence_no' => ((int) (clone $history)->max('sequence_no')) + 1,
                    'version' => (int) $da->version,
                    'material_version' => (int) $da->material_version,
                    'is_version_snapshot' => true,
                    'event_type' => $operation,
                    'actor_user_id' => $actorId,
                    'reason' => $input['reason'] ?? null,
                    'snapshot_json' => $snapshot,
                    'operation_json' => [
                        'operation_id' => $operationId,
                        'restriction_resolution' => $resolutionData,
                    ],
                    'recorded_at' => $now,
                ]);

                $this->outbox->recordIntent('stage2.donation.changed.v1', $chapterId, $da->id, (int) $da->version, (int) $da->material_version);
                if ($updatedLotIds !== []) {
                    $lots = InventoryLot::where('chapter_id', $chapterId)
                        ->whereIn('id', $updatedLotIds)
                        ->sharedLock()
                        ->get(['id', 'stock_version', 'material_version'])
                        ->keyBy('id');
                    foreach ($updatedLotIds as $lotId) {
                        $lot = $lots->get($lotId);
                        $this->outbox->recordIntent(
                            'stage1.stock-lot.changed.v1',
                            $chapterId,
                            $lotId,
                            max(1, (int) ($lot?->stock_version ?? 1)),
                            max(1, (int) ($lot?->material_version ?? 1)),
                        );
                    }
                }

                return response()->json($result, $status, ['X-Action-Replayed' => 'false']);
            });
        } catch (UniqueConstraintViolationException $exception) {
            $existing = (clone $receipts)->sharedLock()->first();
            if ($existing === null) {
                throw $exception;
            }

            return $this->replay($existing, $fingerprint);
        } catch (ContractException $exception) {
            if ($exception->statusCode !== 409
                || $exception->errorCode === 'setup_blocked'
                || $exception->errorCode === 'action_key_conflict') {
                throw $exception;
            }
            if (($exception->extra['current'] ?? null) !== null) {
                throw $exception;
            }

            throw new ContractException(409, $exception->errorCode, $exception->getMessage(), [
                'failed_intent_committed' => false,
                'current' => $before,
                'setup_blockers' => [],
            ]);
        }
    }

    public static function authorizePolicyAction(ChapterAuthority $authority, string $operation, string $preparedBy): PolicyRecord
    {
        $field = self::POLICY_DUTY_FIELDS[$operation];
        $policy = self::effectivePolicy($authority->chapter->id, 'da_authorization', 'CHAPTER_HEAD', 'DaAuthorizationPolicyValue', now('UTC')->toImmutable());
        $allowedDuties = (array) ($policy->rules_json[$field] ?? []);
        $permitted = collect($allowedDuties)->contains(fn (string $duty) => $authority->allowsDuty($duty));
        if (! $permitted) {
            throw new ContractException(403, 'duty_denied', 'Current duty is not authorized by the active DA authorization policy.');
        }
        if (($policy->rules_json['require_preparer_independence'] ?? true) === true && $preparedBy === $authority->membership->user_id) {
            throw new ContractException(403, 'independence_required', 'Preparer independence is required by the active DA authorization policy.');
        }

        return $policy;
    }

    /** @return list<array<string, mixed>> */
    private function applyDraft(Donation $da, string $chapterId, array $input, CarbonImmutable $now, bool $isNew): array
    {
        $policy = self::effectivePolicy($chapterId, 'valuation_rounding', 'FINANCE', 'OpeningValuationPolicyValue', $now);
        $mode = self::roundingMode((string) ($policy->rules_json['rounding_mode'] ?? ''));
        [$preparedLines, $totalPhp] = $this->prepareLines($chapterId, $input['lines'], $mode);

        $policyId = $policy->aggregate_id ?? $policy->id;
        $da->fill([
            'donor_name' => $input['donor_name'],
            'valuation_policy_id' => $policyId,
            'valuation_policy_version' => (int) $policy->policy_version,
            'valuation_policy' => [
                'policy_id' => $policyId,
                'version' => (int) $policy->policy_version,
                'rounding_mode' => $policy->rules_json['rounding_mode'],
            ],
            'pledged_total_value_php' => $totalPhp,
        ]);
        if ($isNew) {
            $da->created_at = $now;
        } else {
            $da->material_version++;
        }

        return $preparedLines;
    }

    /** @return list<array<string, mixed>> */
    private function replaceDraft(Donation $da, string $chapterId, array $input, CarbonImmutable $now): array
    {
        if ($da->status !== 'draft') {
            throw self::conflict('invalid_transition', 'Only draft DAs can be replaced.');
        }

        return $this->applyDraft($da, $chapterId, $input, $now, isNew: false);
    }

    private function submit(Donation $da, string $chapterId, CarbonImmutable $now): void
    {
        if ($da->status !== 'draft') {
            throw self::conflict('invalid_transition', 'Only draft DAs can be submitted.');
        }
        $this->assertCurrentPolicyAndLinesMatch($da, $chapterId, $now);
        $da->status = 'pending_acknowledgment';
    }

    private function acknowledge(
        Donation $da,
        string $chapterId,
        string $actorId,
        array $input,
        CarbonImmutable $now,
        string $nowIso,
        ?array $before,
    ): void {
        if ($da->status !== 'pending_acknowledgment') {
            throw self::conflict('invalid_transition', 'Only pending DAs can be acknowledged.');
        }
        $this->assertCurrentPolicyAndLinesMatch($da, $chapterId, $now);

        $snapshot = [
            'target' => ['purpose' => 'da_acknowledgment', 'record_id' => $da->id],
            'material_version' => (int) $da->material_version,
            'sha256' => CanonicalJson::sha256(DonationResource::acknowledgmentMaterial($da)),
        ];
        $ackPayload = [
            'acknowledgment_id' => (string) Str::uuid(),
            'matched_by' => $actorId,
            'matched_at' => $nowIso,
            'acknowledged_at' => $input['signed_at'],
            'snapshot' => $snapshot,
            'bytes' => $input['evidence'],
        ];
        $this->evidence->verifyMatch($chapterId, $actorId, $snapshot, $input['evidence'], $ackPayload, $before);

        if ($da->reference === null) {
            $da->reference = $this->sequences->nextReference($chapterId, 'DA')['reference'];
        }
        $da->status = 'acknowledged';
        $da->acknowledgment = [
            'actor_id' => $actorId,
            'signed_at' => $input['signed_at'],
            'committed_at' => $nowIso,
            'binding' => $input['evidence'],
            'snapshot' => $snapshot,
        ];
    }

    /** @param list<string> $allowedFrom */
    private function reasonedTransition(Donation $da, array $allowedFrom, string $target): void
    {
        if (! in_array($da->status, $allowedFrom, true)) {
            throw self::conflict('invalid_transition', 'The current DA state does not permit this action.');
        }
        $da->status = $target;
    }

    private function closeShort(Donation $da): void
    {
        if (! in_array($da->status, ['acknowledged', 'partially_received'], true)) {
            throw self::conflict('invalid_transition', 'Only acknowledged or partially received DAs can be closed short.');
        }
        $hasOutstanding = $da->lines->contains(fn (DonationLine $line) => BigDecimal::of($line->outstanding_quantity)->isGreaterThan(0));
        if (! $hasOutstanding) {
            throw self::conflict('invalid_transition', 'The DA has no outstanding pledged quantity to close short.');
        }
        foreach ($da->lines as $line) {
            if (BigDecimal::of($line->outstanding_quantity)->isGreaterThan(0)) {
                $line->closed_short_quantity = $line->outstanding_quantity;
                $line->save();
            }
        }
        $da->status = 'closed_short';
    }

    private function cancel(Donation $da, string $chapterId): void
    {
        if (! in_array($da->status, ['draft', 'returned_for_revision', 'acknowledged'], true)) {
            throw self::conflict('invalid_transition', 'The current DA state does not permit cancellation.');
        }
        $hasPostedRm = DB::table('receiving_reports')
            ->where('chapter_id', $chapterId)
            ->where('source_kind', 'da')
            ->where('source_id', $da->id)
            ->where('status', 'posted')
            ->sharedLock()
            ->exists();
        if ($hasPostedRm) {
            throw self::conflict('invalid_transition', 'Cannot cancel a DA after a DA-RM has posted.');
        }
        $da->status = 'canceled';
    }

    /** @return array{array<string, mixed>, list<string>} */
    private function resolveRestriction(
        Donation $da,
        string $chapterId,
        string $actorId,
        array $input,
        CarbonImmutable $now,
        string $nowIso,
        ?array $before,
    ): array {
        if (! in_array($da->status, ['acknowledged', 'partially_received', 'received', 'closed_short'], true)) {
            throw self::conflict('invalid_transition', 'Donor restrictions can only be resolved after acknowledgment.');
        }

        /** @var DonationLine|null $line */
        $line = $da->lines->firstWhere('id', $input['da_line_id']);
        if (! $line) {
            throw self::notFound();
        }

        $previous = $line->restrictions;
        $next = $input['restrictions'];
        $priorState = $previous['state'] ?? null;
        $nextState = $next['state'] ?? null;
        $kind = $input['resolution_kind'];

        if ($kind === 'apply') {
            $valid = ($priorState === 'uninterpreted' && in_array($nextState, ['bounded', 'unrestricted'], true))
                || ($priorState === 'bounded' && $nextState === 'bounded');
            if (! $valid) {
                throw self::conflict('invalid_transition', 'The requested donor restriction state transition is not allowed.');
            }
        } elseif ($priorState !== 'uninterpreted' || $nextState !== 'uninterpreted'
            || CanonicalJson::encode($next) !== CanonicalJson::encode($previous)) {
            throw self::conflict('invalid_transition', 'Audit review requires an uninterpreted restriction and must retain it unchanged.');
        }

        $evidenceReused = DonationRestrictionResolution::where('chapter_id', $chapterId)
            ->where('da_id', $da->id)
            ->where('binding->evidence_id', $input['evidence']['evidence_id'])
            ->sharedLock()
            ->exists();
        if ($evidenceReused) {
            throw self::conflict('evidence_mismatch', 'Each donor restriction resolution requires a fresh signed evidence lineage.');
        }

        $material = [
            'chapter_id' => $chapterId,
            'da_id' => $da->id,
            'material_version' => (int) $da->material_version,
            'da_line_id' => $line->id,
            'reason' => $input['reason'],
            'resolution_kind' => $kind,
            'restrictions' => $next,
            'previous_restrictions' => $previous,
        ];
        $snapshot = [
            'target' => ['purpose' => 'donor_restriction_resolution', 'record_id' => $da->id],
            'material_version' => (int) $da->material_version,
            'sha256' => CanonicalJson::sha256($material),
        ];
        $ackPayload = [
            'acknowledgment_id' => (string) Str::uuid(),
            'matched_by' => $actorId,
            'matched_at' => $nowIso,
            'acknowledged_at' => $input['signed_at'],
            'snapshot' => $snapshot,
            'bytes' => $input['evidence'],
        ];
        $this->evidence->verifyMatch($chapterId, $actorId, $snapshot, $input['evidence'], $ackPayload, $before);

        $resolutionId = (string) Str::uuid();
        $updatedLotIds = [];
        if ($kind === 'apply') {
            $participant = $this->lotRestrictions->applyLotRestrictionResolution([
                'chapter_id' => $chapterId,
                'da_id' => $da->id,
                'da_line_id' => $line->id,
                'resolution_id' => $resolutionId,
                'previous_restrictions' => $previous,
                'restrictions' => $next,
            ]);
            if (($participant['outcome'] ?? null) === 'rejected') {
                throw self::conflict('target_locked', 'Linked stock lots are locked or conflicted; retry restriction resolution.');
            }
            if (($participant['outcome'] ?? null) !== 'ready' || ! is_array($participant['updated_lot_ids'] ?? null)) {
                throw new ContractException(503, 'unavailable', 'Lot restriction resolution participant is unavailable.');
            }
            $updatedLotIds = array_values(array_unique($participant['updated_lot_ids']));
            $line->restrictions = $next;
            $line->save();
            $da->material_version++;
        }

        $resolution = DonationRestrictionResolution::create([
            'id' => $resolutionId,
            'chapter_id' => $chapterId,
            'da_id' => $da->id,
            'da_line_id' => $line->id,
            'resolution_kind' => $kind,
            'previous_restrictions' => $previous,
            'restrictions' => $next,
            'updated_lot_ids' => $updatedLotIds,
            'binding' => $input['evidence'],
            'snapshot' => $snapshot,
            'actor_id' => $actorId,
            'reason' => $input['reason'],
            'signed_at' => CarbonImmutable::parse($input['signed_at'], 'UTC'),
            'committed_at' => $now,
        ]);

        return [DonationResource::resolution($resolution), $updatedLotIds];
    }

    /** @return array{list<array<string, mixed>>, string} */
    private function prepareLines(string $chapterId, array $lines, RoundingMode $mode): array
    {
        $variants = CatalogueVariant::where('chapter_id', $chapterId)
            ->whereIn('id', array_column($lines, 'variant_id'))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');
        $items = CatalogueItem::where('chapter_id', $chapterId)
            ->whereIn('id', $variants->pluck('item_id'))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');
        $units = CatalogueUnit::where('chapter_id', $chapterId)
            ->whereIn('id', array_column($lines, 'unit_id'))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');

        $prepared = [];
        $lineTotals = [];
        foreach ($lines as $index => $line) {
            $variant = $variants->get($line['variant_id']) ?? throw self::notFound();
            $item = $items->get($variant->item_id) ?? throw self::notFound();
            $unit = $units->get($line['unit_id']) ?? throw self::notFound();

            if ($variant->state !== 'active' || ! $variant->is_active || $item->state !== 'active' || ! $item->is_active) {
                throw OpeningDraftInput::invalidInput([
                    DonationInput::field("/lines/{$index}/variant_id", 'invalid_format', 'The selected catalogue variant must be active.'),
                ]);
            }
            if ($unit->id !== $variant->unit_id || $unit->state !== 'active') {
                throw OpeningDraftInput::invalidInput([
                    DonationInput::field("/lines/{$index}/unit_id", 'invalid_format', 'The selected unit must be active and match the variant.'),
                ]);
            }

            $qty = BigDecimal::of($line['pledged_quantity']);
            $scale = (int) $variant->quantity_scale;
            if ($qty->getScale() > $scale || ($scale === 0 && str_contains($line['pledged_quantity'], '.'))) {
                throw OpeningDraftInput::invalidInput([
                    DonationInput::field("/lines/{$index}/pledged_quantity", 'invalid_format', 'Pledged quantity exceeds the approved variant quantity scale.'),
                ]);
            }
            $normalizedQty = (string) $qty->toScale($scale);
            $pledgedValue = $qty->multipliedBy($line['unit_value_php'])->toScale(2, $mode);
            if ($pledgedValue->isGreaterThan(self::MAX_PHP)) {
                throw OpeningDraftInput::invalidInput([
                    DonationInput::field("/lines/{$index}/unit_value_php", 'invalid_format', 'Line pledged value exceeds the supported maximum.'),
                ]);
            }

            $lineTotals[] = $pledgedValue;
            $prepared[] = [
                'id' => (string) Str::uuid(),
                'line_number' => $index + 1,
                'variant_id' => $variant->id,
                'unit_id' => $unit->id,
                'quantity_scale' => $scale,
                'pledged_quantity' => $normalizedQty,
                'received_quantity' => '0',
                'closed_short_quantity' => '0',
                'outstanding_quantity' => $normalizedQty,
                'unit_value_php' => $line['unit_value_php'],
                'pledged_value_php' => (string) $pledgedValue,
                'valuation_kind' => $line['valuation_kind'],
                'valuation_basis' => $line['valuation_basis'],
                'condition_notes' => $line['condition_notes'],
                'initial_restrictions' => $line['restrictions'],
                'restrictions' => $line['restrictions'],
            ];
        }

        $total = BigDecimal::sum(...$lineTotals);
        if ($total->isGreaterThan(self::MAX_PHP)) {
            throw OpeningDraftInput::invalidInput([
                DonationInput::field('/lines', 'invalid_format', 'Total pledged value exceeds the supported maximum.'),
            ]);
        }

        return [$prepared, (string) $total];
    }

    private function assertCurrentPolicyAndLinesMatch(Donation $da, string $chapterId, CarbonImmutable $now): void
    {
        $policy = self::effectivePolicy($chapterId, 'valuation_rounding', 'FINANCE', 'OpeningValuationPolicyValue', $now);
        $currentPolicyId = $policy->aggregate_id ?? $policy->id;
        $currentPolicyVersion = (int) $policy->policy_version;
        $mode = self::roundingMode((string) ($policy->rules_json['rounding_mode'] ?? ''));

        $variants = CatalogueVariant::where('chapter_id', $chapterId)
            ->whereIn('id', $da->lines->pluck('variant_id'))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');
        $items = CatalogueItem::where('chapter_id', $chapterId)
            ->whereIn('id', $variants->pluck('item_id'))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');
        $units = CatalogueUnit::where('chapter_id', $chapterId)
            ->whereIn('id', $da->lines->pluck('unit_id'))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');

        $recomputedTotals = [];
        foreach ($da->lines as $line) {
            $variant = $variants->get($line->variant_id);
            $item = $variant ? $items->get($variant->item_id) : null;
            $unit = $units->get($line->unit_id);
            if (! $variant || ! $item || ! $unit
                || $variant->state !== 'active' || ! $variant->is_active
                || $item->state !== 'active' || ! $item->is_active
                || $unit->id !== $variant->unit_id || $unit->state !== 'active'
                || (int) $variant->quantity_scale !== (int) $line->quantity_scale) {
                throw self::conflict('version_conflict', 'Active variant, unit, or quantity scale changed; revise the DA before proceeding.');
            }
            $recomputed = BigDecimal::of($line->pledged_quantity)->multipliedBy($line->unit_value_php)->toScale(2, $mode);
            if ((string) $recomputed !== (string) $line->pledged_value_php) {
                throw self::conflict('version_conflict', 'Effective valuation rounding changed line values; revise the DA and obtain fresh paper.');
            }
            $recomputedTotals[] = $recomputed;
        }

        $total = (string) BigDecimal::sum(...$recomputedTotals);
        if ($currentPolicyId !== $da->valuation_policy_id
            || $currentPolicyVersion !== (int) $da->valuation_policy_version
            || $total !== (string) $da->pledged_total_value_php) {
            throw self::conflict('version_conflict', 'Effective valuation policy changed DA material; revise the DA and obtain fresh paper.');
        }
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
        $message = 'Current approved setup is required for this action.';

        throw new ContractException(409, 'setup_blocked', $message, [
            'error' => [
                'code' => 'setup_blocked',
                'message' => $message,
                'blockers' => [$blocker],
            ],
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

    public static function history(Donation $da): Builder
    {
        return Stage2RecordHistory::where('chapter_id', $da->chapter_id)
            ->where('record_kind', 'donation')
            ->where('record_id', $da->id);
    }

    public static function conflict(string $code, string $message): ContractException
    {
        return new ContractException(409, $code, $message, [
            'failed_intent_committed' => false,
            'current' => null,
            'setup_blockers' => [],
        ]);
    }

    public static function notFound(): ContractException
    {
        return new ContractException(404, 'resource_not_found', 'Resource not found.');
    }
}
