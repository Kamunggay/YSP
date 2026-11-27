<?php

namespace App\Services\Procurement;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Requests\RepfInput;
use App\Http\Resources\RepfResource;
use App\Models\ActionReceipt;
use App\Models\CatalogueItem;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\InternalRf;
use App\Models\InternalRfLine;
use App\Models\Repf;
use App\Models\RepfLine;
use App\Models\Stage2RecordHistory;
use App\Services\Authority\ChapterAuthority;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\CanonicalJson;
use App\Services\Shared\ReferenceSequenceService;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class RepfWorkflow
{
    public const ACTIONS = [
        'createRepf' => 'repf.draft',
        'replaceRepf' => 'repf.draft',
        'submitRepf' => 'repf.submit',
        'reviewRepfBudget' => 'repf.budget_review',
        'resumeRepfReview' => 'repf.budget_review',
        'reviseRepf' => 'repf.draft',
        'cancelRepf' => 'repf.cancel',
    ];

    private const POST_APPROVAL = ['approved', 'partially_ordered'];

    public const RELATIONS = ['preparer', 'lines.variant.item', 'lines.variant.unit'];

    public function __construct(
        private readonly RepfNetNeed $netNeed,
        private readonly ReferenceSequenceService $sequences,
        private readonly DomainNotificationOutboxService $outbox,
    ) {}

    public function mutate(Request $request, string $chapterId, ?string $id, string $operation, string $key, array $input): JsonResponse
    {
        if (! Str::isUuid($chapterId, 4)) {
            throw new ContractException(503, 'unavailable', 'Stage 2 notifications are unavailable for this chapter.');
        }

        $scope = ['chapter_id' => $chapterId, 'user_id' => $request->user()->id, 'operation' => $operation, 'key' => $key, 'evidence_scope' => ''];
        $fingerprint = CanonicalJson::sha256([$id, $input]);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $receipts = ActionReceipt::where($scope);

        if ($existing = (clone $receipts)->first()) {
            return $this->replay($existing, $fingerprint, $authority);
        }

        $before = null;
        try {
            return DB::transaction(function () use ($request, $id, $operation, $input, $scope, $fingerprint, $authority, $receipts, &$before) {
                $chapter = $authority->chapter->id;
                $query = Repf::where('chapter_id', $chapter)->whereKey($id);
                $preview = $id === null ? collect() : RepfLine::whereIn('repf_id', (clone $query)->select('id'))->get(['rf_id']);
                $rfIds = array_values(array_unique(array_filter([
                    ...$preview->pluck('rf_id')->all(), ...array_column($input['lines'] ?? [], 'rf_id'),
                ])));
                $rfs = InternalRf::where('chapter_id', $chapter)->whereIn('id', $rfIds)
                    ->orderBy('id')->sharedLock()->get()->keyBy('id');

                $repf = $id === null
                    ? new Repf([
                        'id' => (string) Str::uuid(), 'chapter_id' => $chapter,
                        'status' => 'draft', 'version' => 1, 'material_version' => 1,
                    ])
                    : ((clone $query)->lockForUpdate()->first() ?? throw self::notFound());
                $storedLines = $id === null ? collect() : $repf->lines()->get();
                $lines = $input['lines'] ?? $storedLines->map(fn (RepfLine $line) => [
                    ...Arr::only($line->getAttributes(), ['trigger_kind', 'variant_id', 'unit_id', 'rf_id', 'rf_line_id']),
                    'requested_quantity' => RepfResource::quantity($line, 'requested_quantity'),
                    'additional_purchase_reason' => $line->additional_purchase_reason,
                ])->all();

                $this->lockVariantGuards($chapter, [...$storedLines->pluck('variant_id')->all(), ...array_column($lines, 'variant_id')]);
                if ($existing = (clone $receipts)->sharedLock()->first()) {
                    return $this->replay($existing, $fingerprint, $authority);
                }

                $fromStatus = $id === null ? null : $repf->status;
                if ($id !== null) {
                    $before = (new RepfResource($repf->load(self::RELATIONS)))->resolve($request);
                    if ($repf->version !== $input['expected_version'] || $repf->material_version !== $input['expected_material_version']
                        || $storedLines->pluck('rf_id')->filter()->diff($rfIds)->isNotEmpty()) {
                        throw self::conflict('version_conflict', 'Read the current RepF before trying again.');
                    }
                }

                $decision = $input['decision'] ?? null;
                $action = $this->transition($repf, $operation, $decision, $authority);
                $newMaterial = isset($input['lines']);
                $enforceNeed = $newMaterial || $operation === 'submitRepf' || $decision === 'approve';
                $identities = $enforceNeed ? $this->validateSources($chapter, $lines, $rfs) : [];
                $breakdowns = $this->netNeed->snapshot($chapter, $scope['user_id'], $id, $lines, $enforceNeed);
                $now = now('UTC');
                if ($operation === 'submitRepf' && $repf->repf_reference === null) {
                    $repf->repf_reference = $this->sequences->nextReference($chapter, 'REPF')['reference'];
                }

                $actor = RepfResource::actor($request->user());
                $this->applyReview($repf, $operation, $input, $actor, RepfResource::instant($now));
                if ($id !== null) {
                    $repf->version++;
                    if ($newMaterial || $operation === 'reviseRepf') {
                        $repf->material_version++;
                    }
                }
                if ($newMaterial) {
                    $lines = $this->newLines($lines, $identities, $breakdowns);
                    $total = BigDecimal::sum(...array_column($lines, 'estimated_line_total_php'));
                    $this->checkAmount($total, '/lines');
                    $repf->fill(Arr::only($input, ['funding_source', 'urgency', 'justification']) + [
                        'prepared_by' => $repf->prepared_by ?? $scope['user_id'],
                        'estimated_total_php' => (string) $total,
                        'linked_demand_canceled' => false,
                        'linked_demand_canceled_at' => null,
                    ]);
                }

                $repf->save();
                if ($newMaterial) {
                    $repf->lines()->delete();
                    $repf->lines()->createMany($lines);
                } elseif ($enforceNeed) {
                    foreach ($storedLines as $index => $line) {
                        $line->update($identities[$index] + ['net_need_breakdown' => $breakdowns[$index]]);
                    }
                } elseif ($operation === 'cancelRepf') {
                    foreach ($storedLines as $line) {
                        $line->update([
                            'canceled_quantity' => (string) BigDecimal::of($line->canceled_quantity)->plus($line->remaining_to_order_quantity),
                            'remaining_to_order_quantity' => '0',
                        ]);
                    }
                }

                $snapshot = (new RepfResource($repf->load(self::RELATIONS)))->resolve($request);
                $operationId = (string) Str::uuid();
                $status = $id === null ? 201 : 200;
                $result = ['data' => [
                    'operation_id' => $operationId,
                    'chapter_id' => $chapter,
                    'actor_id' => $scope['user_id'],
                    'operation_name' => $operation,
                    'action_key' => $scope['key'],
                    'resource_kind' => 'repf',
                    'resource_id' => $repf->id,
                    'committed_version' => $repf->version,
                    'committed_material_version' => $repf->material_version,
                    'status_code' => $status,
                    'committed_at' => RepfResource::instant($now),
                    'outcome' => 'committed',
                    'result' => $snapshot,
                ]];

                ActionReceipt::create($scope + ['id' => $operationId, 'fingerprint' => $fingerprint, 'status' => $status, 'result' => $result]);
                $history = self::history($repf);
                $history->create([
                    'chapter_id' => $chapter,
                    'record_kind' => 'repf',
                    'record_id' => $repf->id,
                    'sequence_no' => ((int) (clone $history)->max('sequence_no')) + 1,
                    'version' => $repf->version,
                    'material_version' => $repf->material_version,
                    'is_version_snapshot' => true,
                    'event_type' => $action,
                    'actor_user_id' => $scope['user_id'],
                    'reason' => $input['reason'] ?? null,
                    'snapshot_json' => $snapshot,
                    'operation_json' => ['operation_id' => $operationId, 'from_status' => $fromStatus, 'actor' => $actor],
                    'recorded_at' => $now,
                ]);
                $this->outbox->recordIntent('stage2.repf.changed.v1', $chapter, $repf->id, $repf->version, $repf->material_version);

                return response()->json($result, $status, ['X-Action-Replayed' => 'false']);
            });
        } catch (UniqueConstraintViolationException $exception) {
            // A concurrent request using the key with disjoint variants may win the receipt insert.
            $existing = (clone $receipts)->sharedLock()->first();
            if ($existing === null) {
                throw $exception;
            }

            return $this->replay($existing, $fingerprint, $authority);
        } catch (ContractException $exception) {
            if ($exception->statusCode !== 409 || $exception->errorCode === 'action_key_conflict') {
                throw $exception;
            }

            throw new ContractException(409, $exception->errorCode, $exception->getMessage(), ['current' => $before] + $exception->extra);
        }
    }

    private function lockVariantGuards(string $chapter, array $ids): void
    {
        $ids = array_values(array_unique($ids));
        sort($ids, SORT_STRING);
        $guards = DB::table('chapter_variant_procurement_guards');
        $guards->upsert(array_map(fn (string $id) => ['chapter_id' => $chapter, 'variant_id' => $id], $ids),
            ['chapter_id', 'variant_id'], ['variant_id']);
        $guards->where('chapter_id', $chapter)->whereIn('variant_id', $ids)->orderBy('variant_id')->lockForUpdate()->get();
    }

    private function validateSources(string $chapter, array $lines, Collection $rfs): array
    {
        $variants = CatalogueVariant::where('chapter_id', $chapter)->whereIn('id', array_column($lines, 'variant_id'))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');
        $items = CatalogueItem::where('chapter_id', $chapter)->whereIn('id', $variants->pluck('item_id'))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');
        $units = CatalogueUnit::where('chapter_id', $chapter)->whereIn('id', array_column($lines, 'unit_id'))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');
        $sources = InternalRfLine::whereIn('rf_id', $rfs->keys())->whereIn('id', array_filter(array_column($lines, 'rf_line_id')))
            ->orderBy('id')->sharedLock()->get()->keyBy('id');

        $identities = [];
        foreach ($lines as $index => $line) {
            $variant = $variants->get($line['variant_id']) ?? throw self::notFound();
            $item = $items->get($variant->item_id) ?? throw self::notFound();
            $unit = $units->get($line['unit_id']) ?? throw self::notFound();
            if ($unit->id !== $variant->unit_id || $unit->state !== 'active' || $variant->state !== 'active'
                || ! $variant->is_active || $item->state !== 'active' || ! $item->is_active) {
                throw self::conflict('source_not_eligible', 'The selected catalogue variant and unit must be active and compatible.');
            }
            if (BigDecimal::of($line['requested_quantity'])->getScale() !== $variant->quantity_scale) {
                throw OpeningDraftInput::invalidInput([RepfInput::field("/lines/$index/requested_quantity", 'Use the approved variant quantity scale.')]);
            }

            $rf = null;
            if ($line['trigger_kind'] === 'rf_shortage') {
                $rf = $rfs->get($line['rf_id']) ?? throw self::notFound();
                $source = $sources->get($line['rf_line_id']) ?? throw self::notFound();
                if ($rf->status !== 'approved' || $rf->rf_number === null || $rf->closed_at !== null
                    || $source->rf_id !== $rf->id || $source->variant_id !== $variant->id || $source->unit_id !== $unit->id
                    || BigDecimal::of($source->approved_quantity)->minus($source->issued_quantity)->minus($source->canceled_quantity)->isLessThanOrEqualTo(0)) {
                    throw self::conflict('source_not_eligible', 'The linked RF line is no longer eligible.');
                }
            }

            $identities[] = [
                'item_id' => $item->id,
                'quantity_scale' => $variant->quantity_scale,
                'rf_reference' => $rf?->rf_number,
                'rf_material_version' => $rf?->material_version,
            ];
        }

        return $identities;
    }

    private function newLines(array $lines, array $identities, array $breakdowns): array
    {
        foreach ($lines as $index => &$line) {
            $total = BigDecimal::of($line['requested_quantity'])->multipliedBy($line['estimated_unit_cost_php'])->toScale(2, RoundingMode::HalfUp);
            $this->checkAmount($total, "/lines/$index/estimated_unit_cost_php");
            $line += $identities[$index] + [
                'line_number' => $index + 1,
                'remaining_to_order_quantity' => $line['requested_quantity'],
                'estimated_line_total_php' => (string) $total,
                'net_need_breakdown' => $breakdowns[$index],
            ];
        }

        return $lines;
    }

    private function checkAmount(BigDecimal $amount, string $pointer): void
    {
        if ($amount->isGreaterThan('999999999999.99')) {
            throw OpeningDraftInput::invalidInput([RepfInput::field($pointer, 'The estimated PHP total exceeds the supported maximum.')]);
        }
    }

    private function transition(Repf $repf, string $operation, ?string $decision, ChapterAuthority $authority): string
    {
        $status = $repf->status;
        if (in_array($operation, ['reviewRepfBudget', 'resumeRepfReview'], true) && $repf->prepared_by === $authority->membership->user_id) {
            throw new ContractException(403, 'independence_required', 'Budget review requires an independent officer.');
        }

        $allowed = match ($operation) {
            'createRepf', 'replaceRepf', 'submitRepf' => $status === 'draft',
            'reviewRepfBudget' => $status === 'pending_budget_review' || ($status === 'held' && $decision === 'return'),
            'resumeRepfReview' => $status === 'held',
            'reviseRepf' => $status === 'returned_for_revision',
            'cancelRepf' => in_array($status, ['draft', 'held', 'returned_for_revision', ...self::POST_APPROVAL], true),
        };
        if (! $allowed) {
            throw self::conflict('invalid_transition', 'The current RepF state does not permit this action.');
        }

        if ($operation === 'cancelRepf' && in_array($status, self::POST_APPROVAL, true)) {
            $authority->requireAction('repf.budget_review');
        }
        if ($decision === 'approve' && ! $authority->grants->contains(fn ($grant) => in_array($grant->duty_code, ChapterAuthority::ACTION_DUTIES['repf.budget_review'], true)
            && ! $grant->is_alternate
            && ChapterAuthority::covers($grant, null, $repf->estimated_total_php))) {
            throw new ContractException(403, 'duty_limit_exceeded', 'The estimated total exceeds the active budget duty limit.');
        }

        $repf->status = match ($operation) {
            'submitRepf', 'resumeRepfReview' => 'pending_budget_review',
            'reviseRepf' => 'draft',
            'cancelRepf' => 'canceled',
            'reviewRepfBudget' => match ($decision) {
                'approve' => 'approved',
                'hold' => 'held',
                'return' => 'returned_for_revision',
                'reject' => 'rejected',
            },
            default => $status,
        };

        return $decision === null ? $operation : $decision.'Repf';
    }

    private function applyReview(Repf $repf, string $operation, array $input, array $actor, string $at): void
    {
        $review = $repf->review_json ?? [];
        $repf->review_json = match ($operation) {
            'submitRepf' => ['submitted_by' => $actor, 'submitted_at' => $at],
            'resumeRepfReview' => Arr::only($review, ['submitted_by', 'submitted_at']),
            'reviseRepf' => [],
            'reviewRepfBudget' => array_replace($review, [
                'budget_reviewer' => $actor, 'budget_reviewed_at' => $at,
                'budget_decision' => $input['decision'], 'budget_decision_reason' => $input['reason'],
            ]),
            'cancelRepf' => array_replace($review, ['canceled_by' => $actor, 'canceled_at' => $at, 'cancel_reason' => $input['reason']]),
            default => $review,
        };

        if (($input['decision'] ?? null) === 'approve') {
            $repf->approved_budget_php = $repf->estimated_total_php;
        }
    }

    private function replay(ActionReceipt $receipt, string $fingerprint, ChapterAuthority $authority): JsonResponse
    {
        if (! hash_equals($receipt->fingerprint, $fingerprint)) {
            throw self::conflict('action_key_conflict', 'Use a new action key for changed input.');
        }
        if ($receipt->operation === 'cancelRepf' && $receipt->result['data']['result']['approved_budget_php'] !== null) {
            $authority->requireAction('repf.budget_review');
        }

        return response()->json($receipt->result, $receipt->status, ['X-Action-Replayed' => 'true']);
    }

    public static function history(Repf $repf): Builder
    {
        return Stage2RecordHistory::where('chapter_id', $repf->chapter_id)->where('record_kind', 'repf')->where('record_id', $repf->id);
    }

    public static function conflict(string $code, string $message, array $blockers = [], array $coverage = []): ContractException
    {
        return new ContractException(409, $code, $message, [
            'failed_intent_committed' => false, 'current' => null, 'setup_blockers' => $blockers, 'coverage_conflicts' => $coverage,
        ]);
    }

    public static function notFound(): ContractException
    {
        return new ContractException(404, 'resource_not_found', 'Resource not found.');
    }
}
