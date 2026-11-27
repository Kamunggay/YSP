<?php

namespace App\Services\Procurement;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Requests\RepfInput;
use App\Http\Resources\QuotationResource;
use App\Http\Resources\RepfResource;
use App\Models\ActionReceipt;
use App\Models\EvidenceRecord;
use App\Models\PurchaseOrder;
use App\Models\Repf;
use App\Models\RepfQuotation;
use App\Services\Authority\ChapterAuthority;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\CanonicalJson;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class QuotationWorkflow
{
    public const ACTIONS = [
        'createRepfQuotation' => 'quotation.manage',
        'replaceRepfQuotation' => 'quotation.manage',
        'deleteRepfQuotation' => 'quotation.manage',
        'recordSupplierSelection' => 'quotation.select',
    ];

    private const ELIGIBLE_REPF = ['approved', 'partially_ordered'];

    public function __construct(
        private readonly CheckEvidenceBindingParticipant $evidence,
        private readonly DomainNotificationOutboxService $outbox,
    ) {}

    public function mutate(Request $request, string $chapterId, string $repfId, ?string $quotationId, string $operation, string $key, array $input): JsonResponse
    {
        if (! Str::isUuid($chapterId, 4)) {
            throw new ContractException(503, 'unavailable', 'Stage 2 notifications are unavailable for this chapter.');
        }

        $scope = ['chapter_id' => $chapterId, 'user_id' => $request->user()->id, 'operation' => $operation, 'key' => $key, 'evidence_scope' => ''];
        $fingerprint = CanonicalJson::sha256([$repfId, $quotationId, $input]);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $receipts = ActionReceipt::where($scope);

        if ($existing = (clone $receipts)->first()) {
            return $this->replay($existing, $fingerprint);
        }

        $before = null;
        try {
            return DB::transaction(function () use ($request, $repfId, $quotationId, $operation, $input, $scope, $fingerprint, $authority, $receipts, &$before) {
                $chapter = $authority->chapter->id;
                $repf = Repf::where('chapter_id', $chapter)->whereKey($repfId)->lockForUpdate()->first()
                    ?? throw RepfWorkflow::notFound();

                if ($existing = (clone $receipts)->sharedLock()->first()) {
                    return $this->replay($existing, $fingerprint);
                }

                $now = now('UTC');
                $actor = RepfResource::actor($request->user());
                $operationId = (string) Str::uuid();

                if ($operation === 'recordSupplierSelection') {
                    [$status, $resourceKind, $resourceId, $committedVersion, $committedMaterial, $payload] = $this->selectSupplier(
                        $repf, $input, $actor, $now
                    );
                } elseif ($operation === 'deleteRepfQuotation') {
                    [$status, $resourceKind, $resourceId, $committedVersion, $committedMaterial, $payload] = $this->deleteQuotation(
                        $repf, $quotationId, $input, $actor, $now, $authority, $before
                    );
                } else {
                    [$status, $resourceKind, $resourceId, $committedVersion, $committedMaterial, $payload] = $this->saveQuotation(
                        $repf, $quotationId, $input, $scope['user_id'], $now, $authority, $before
                    );
                }

                $result = ['data' => [
                    'operation_id' => $operationId,
                    'chapter_id' => $chapter,
                    'actor_id' => $scope['user_id'],
                    'operation_name' => $operation,
                    'action_key' => $scope['key'],
                    'resource_kind' => $resourceKind,
                    'resource_id' => $resourceId,
                    'committed_version' => $committedVersion,
                    'committed_material_version' => $committedMaterial,
                    'status_code' => $status,
                    'committed_at' => RepfResource::instant($now),
                    'outcome' => 'committed',
                    'result' => $payload,
                ]];

                ActionReceipt::create($scope + [
                    'id' => $operationId, 'fingerprint' => $fingerprint, 'status' => $status, 'result' => $result,
                ]);

                $history = RepfWorkflow::history($repf);
                $history->create([
                    'chapter_id' => $chapter,
                    'record_kind' => 'repf',
                    'record_id' => $repf->id,
                    'sequence_no' => ((int) (clone $history)->max('sequence_no')) + 1,
                    'version' => $repf->version,
                    'material_version' => $repf->material_version,
                    'is_version_snapshot' => false,
                    'event_type' => $operation,
                    'actor_user_id' => $scope['user_id'],
                    'reason' => $input['emergency_waiver']['reason'] ?? ($input['selection_rationale'] ?? null),
                    'snapshot_json' => $payload,
                    'operation_json' => ['operation_id' => $operationId, 'resource_kind' => $resourceKind, 'resource_id' => $resourceId, 'actor' => $actor],
                    'recorded_at' => $now,
                ]);

                $this->outbox->recordIntent('stage2.repf.changed.v1', $chapter, $repf->id, $repf->version, $repf->material_version);

                return response()->json($result, $status, ['X-Action-Replayed' => 'false']);
            });
        } catch (UniqueConstraintViolationException $exception) {
            $existing = (clone $receipts)->sharedLock()->first();
            if ($existing === null) {
                throw $exception;
            }

            return $this->replay($existing, $fingerprint);
        } catch (ContractException $exception) {
            if ($exception->statusCode !== 409 || $exception->errorCode === 'action_key_conflict') {
                throw $exception;
            }
            $extra = [
                'failed_intent_committed' => false,
                'current' => $exception->extra['current'] ?? $before,
                'setup_blockers' => $exception->extra['setup_blockers'] ?? [],
                'policy_evaluation' => $exception->extra['policy_evaluation'] ?? null,
            ];

            throw new ContractException(409, $exception->errorCode, $exception->getMessage(), $extra);
        }
    }

    private function saveQuotation(
        Repf $repf,
        ?string $quotationId,
        array $input,
        string $userId,
        $now,
        ChapterAuthority $authority,
        ?array &$before,
    ): array {
        $quote = null;
        if ($quotationId !== null) {
            $quote = RepfQuotation::where('chapter_id', $repf->chapter_id)->where('repf_id', $repf->id)
                ->whereKey($quotationId)->lockForUpdate()->first() ?? throw RepfWorkflow::notFound();
            $quote->load('recorder');
            $before = QuotationResource::format($quote, $authority);
            if ($quote->version !== $input['expected_version'] || $quote->material_version !== $input['expected_material_version']) {
                throw QuotationPolicy::conflict('version_conflict', 'Read the current quotation before trying again.', $before);
            }
        }

        if (! in_array($repf->status, self::ELIGIBLE_REPF, true)) {
            throw QuotationPolicy::conflict('source_not_eligible', 'Quotations require an approved or partially_ordered RepF.', $before);
        }
        if ($quote !== null && ($quote->is_selected || PurchaseOrder::where('repf_id', $repf->id)->where('selected_quotation_id', $quote->id)->exists())) {
            throw QuotationPolicy::conflict('invalid_transition', 'Selected quotations cannot be replaced.', $before);
        }

        $repfLines = $repf->lines()->get()->keyBy('id');
        $priorLineIds = $quote ? array_column($quote->lines ?? [], 'id', 'repf_line_id') : [];
        $seen = [];
        $storedLines = [];
        foreach ($input['lines'] as $i => $line) {
            $repfLineId = $line['repf_line_id'];
            if (isset($seen[$repfLineId])) {
                throw OpeningDraftInput::invalidInput([RepfInput::field("/lines/$i/repf_line_id", 'Each RepF line may appear once per quotation.')]);
            }
            $seen[$repfLineId] = true;
            $repfLine = $repfLines->get($repfLineId) ?? throw RepfWorkflow::notFound();
            if ($line['variant_id'] !== $repfLine->variant_id || $line['unit_id'] !== $repfLine->unit_id) {
                throw QuotationPolicy::conflict('source_not_eligible', 'Quotation line variant and unit must match the RepF line.', $before);
            }
            if (BigDecimal::of($line['quoted_quantity'])->getScale() !== (int) $repfLine->quantity_scale) {
                throw OpeningDraftInput::invalidInput([RepfInput::field("/lines/$i/quoted_quantity", 'Use the approved variant quantity scale.')]);
            }
            $lineTotal = BigDecimal::of($line['quoted_quantity'])->multipliedBy($line['unit_price_php'])->toScale(2, RoundingMode::HalfUp);
            if ($lineTotal->isGreaterThan('999999999999.99')) {
                throw OpeningDraftInput::invalidInput([RepfInput::field("/lines/$i/unit_price_php", 'The PHP total exceeds the supported maximum.')]);
            }
            $storedLines[] = [
                'id' => $priorLineIds[$repfLineId] ?? (string) Str::uuid(),
                'repf_line_id' => $repfLineId,
                'variant_id' => $line['variant_id'],
                'unit_id' => $line['unit_id'],
                'quantity_scale' => (int) $repfLine->quantity_scale,
                'quoted_quantity' => $line['quoted_quantity'],
                'unit_price_php' => $line['unit_price_php'],
                'line_total_php' => (string) $lineTotal,
                'notes' => $line['notes'],
            ];
        }
        $total = BigDecimal::sum(...array_column($storedLines, 'line_total_php'));
        if ($total->isGreaterThan('999999999999.99')) {
            throw OpeningDraftInput::invalidInput([RepfInput::field('/lines', 'The quotation total exceeds the supported maximum.')]);
        }

        $binding = $input['evidence'] === null ? null : $this->evidence->verifyCurrentBytes(
            $repf->chapter_id,
            $input['evidence'],
            'quotation_attachment',
            fn (EvidenceRecord $record) => $record->record_id === $repf->id,
        );

        $terms = Arr::only($input, [
            'quoted_at', 'valid_until', 'lead_time_days', 'availability_summary',
            'quality_warranty_terms', 'payment_and_delivery_terms', 'reliability_notes',
        ]);

        if ($quote === null) {
            $quote = RepfQuotation::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $repf->chapter_id,
                'repf_id' => $repf->id,
                'version' => 1,
                'material_version' => 1,
                'supplier' => $input['supplier'],
                'lines' => $storedLines,
                'terms_json' => $terms,
                'total_amount_php' => (string) $total,
                'is_selected' => false,
                'selected_at' => null,
                'evidence_binding' => $binding,
                'recorded_by' => $userId,
            ]);
            $status = 201;
        } else {
            $quote->fill([
                'version' => $quote->version + 1,
                'material_version' => $quote->material_version + 1,
                'supplier' => $input['supplier'],
                'lines' => $storedLines,
                'terms_json' => $terms,
                'total_amount_php' => (string) $total,
                'evidence_binding' => $binding,
            ]);
            $quote->updated_at = $now;
            $quote->save();
            $status = 200;
        }

        $quote->load('recorder');
        $formatted = QuotationResource::format($quote, $authority, enforceEvidenceRead: true);

        return [$status, 'quotation', $quote->id, (int) $quote->version, (int) $quote->material_version, $formatted];
    }

    private function deleteQuotation(
        Repf $repf,
        string $quotationId,
        array $input,
        array $actor,
        $now,
        ChapterAuthority $authority,
        ?array &$before,
    ): array {
        $quote = RepfQuotation::where('chapter_id', $repf->chapter_id)->where('repf_id', $repf->id)
            ->whereKey($quotationId)->lockForUpdate()->first() ?? throw RepfWorkflow::notFound();
        $quote->load('recorder');
        $before = QuotationResource::format($quote, $authority);

        if (! in_array($repf->status, self::ELIGIBLE_REPF, true)) {
            throw QuotationPolicy::conflict('source_not_eligible', 'Deleting a quotation requires an approved or partially_ordered RepF.', $before);
        }
        if ($quote->version !== $input['expected_version'] || $quote->material_version !== $input['expected_material_version']) {
            throw QuotationPolicy::conflict('version_conflict', 'Read the current quotation before trying again.', $before);
        }
        $referencedInSelection = collect($repf->supplier_selection_json['selections'] ?? [])
            ->contains(fn (array $sel) => $sel['selected_quotation_id'] === $quote->id);
        if ($quote->is_selected || $referencedInSelection
            || PurchaseOrder::where('repf_id', $repf->id)->where('selected_quotation_id', $quote->id)->exists()) {
            throw QuotationPolicy::conflict('invalid_transition', 'Selected or PO-referenced quotations cannot be deleted.', $before);
        }

        $prevVersion = (int) $quote->version;
        $prevMaterial = (int) $quote->material_version;
        $quote->delete();

        $summary = [
            'id' => $quotationId,
            'chapter_id' => $repf->chapter_id,
            'repf_id' => $repf->id,
            'deleted' => true,
            'deleted_by' => $actor,
            'deleted_at' => RepfResource::instant($now),
            'previous_version' => $prevVersion,
            'previous_material_version' => $prevMaterial,
        ];

        return [200, 'quotation_deletion', $quotationId, $prevVersion + 1, $prevMaterial, $summary];
    }

    private function selectSupplier(Repf $repf, array $input, array $actor, $now): array
    {
        if ($repf->version !== $input['expected_repf_version'] || $repf->material_version !== $input['expected_repf_material_version']) {
            throw QuotationPolicy::conflict('version_conflict', 'Read the current RepF before recording supplier selection.');
        }
        if (! in_array($repf->status, self::ELIGIBLE_REPF, true)) {
            throw QuotationPolicy::conflict('source_not_eligible', 'Supplier selection requires an approved or partially_ordered RepF.');
        }

        $ids = $input['comparable_quotation_ids'];
        $quotes = RepfQuotation::where('chapter_id', $repf->chapter_id)->where('repf_id', $repf->id)
            ->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        if ($quotes->count() !== count($ids) || ! $quotes->has($input['selected_quotation_id'])) {
            throw RepfWorkflow::notFound();
        }

        $selected = $quotes->get($input['selected_quotation_id']);
        $waiver = $input['emergency_waiver'];
        $evaluation = QuotationPolicy::evaluate(
            $repf->chapter_id,
            (string) $selected->total_amount_php,
            count($ids),
            $waiver !== null,
        );

        $at = RepfResource::instant($now);
        $selected->is_selected = true;
        $selected->selected_at = $now;
        $selected->version++;
        $selected->waiver_json = $waiver === null ? null : ['reason' => $waiver['reason'], 'recorded_at' => $at];
        $selected->updated_at = $now;
        $selected->save();

        $selectionId = (string) Str::uuid();
        $selection = [
            'id' => $selectionId,
            'chapter_id' => $repf->chapter_id,
            'repf_id' => $repf->id,
            'version' => 1,
            'material_version' => 1,
            'selected_quotation_id' => $selected->id,
            'comparable_quotation_ids' => array_values($ids),
            'comparable_quote_count' => count($ids),
            'policy_evaluation' => $evaluation,
            'emergency_waiver_used' => (bool) $evaluation['emergency_waiver_used'],
            'emergency_waiver_reason' => $evaluation['emergency_waiver_used'] ? $waiver['reason'] : null,
            'selection_rationale' => $input['selection_rationale'],
            'selected_by' => $actor,
            'selected_at' => $at,
        ];

        $stored = $repf->supplier_selection_json ?? ['latest_id' => null, 'selections' => []];
        $stored['latest_id'] = $selectionId;
        $stored['selections'][$selectionId] = $selection;
        $repf->supplier_selection_json = $stored;
        $repf->save();

        return [201, 'supplier_selection', $selectionId, 1, 1, $selection];
    }

    private function replay(ActionReceipt $receipt, string $fingerprint): JsonResponse
    {
        if (! hash_equals($receipt->fingerprint, $fingerprint)) {
            throw QuotationPolicy::conflict('action_key_conflict', 'Use a new action key for changed input.');
        }

        return response()->json($receipt->result, $receipt->status, ['X-Action-Replayed' => 'true']);
    }
}
