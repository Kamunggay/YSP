<?php

namespace App\Services\Procurement;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Requests\RepfInput;
use App\Http\Resources\PurchaseOrderResource;
use App\Http\Resources\RepfResource;
use App\Models\ActionReceipt;
use App\Models\CatalogueItem;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\EvidenceRecord;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderAmendment;
use App\Models\PurchaseOrderLine;
use App\Models\Repf;
use App\Models\RepfQuotation;
use App\Models\Stage2RecordHistory;
use App\Services\Authority\ChapterAuthority;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\CanonicalJson;
use App\Services\Shared\ReferenceSequenceService;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class PurchaseOrderWorkflow
{
    public const ACTIONS = [
        'createPurchaseOrder' => 'po.draft',
        'replacePurchaseOrder' => 'po.draft',
        'submitPurchaseOrder' => 'po.submit',
        'approvePurchaseOrder' => 'po.approve',
        'returnPurchaseOrder' => 'po.approve',
        'rejectPurchaseOrder' => 'po.approve',
        'recordPurchaseOrderAcknowledgment' => 'po.acknowledge',
        'proposePurchaseOrderAmendment' => 'po.amend_propose',
        'approvePurchaseOrderAmendment' => 'po.amend_approve',
        'closeShortPurchaseOrder' => 'po.close_short',
        'cancelPurchaseOrder' => 'po.cancel',
    ];

    public const RELATIONS = ['preparer', 'repf.preparer', 'lines.variant.item', 'lines.unit', 'amendments.proposer', 'amendments.approver'];

    private const COMMITTED_BUDGET_STATUSES = ['issued', 'partially_received', 'receiving_complete', 'closed_short'];

    public function __construct(
        private readonly ReferenceSequenceService $sequences,
        private readonly CheckEvidenceBindingParticipant $evidence,
        private readonly DomainNotificationOutboxService $outbox,
    ) {}

    public function mutate(
        Request $request,
        string $chapterId,
        ?string $poId,
        ?string $amendmentId,
        string $operation,
        string $key,
        array $input,
    ): JsonResponse {
        if (! Str::isUuid($chapterId, 4)) {
            throw new ContractException(503, 'unavailable', 'Stage 2 notifications are unavailable for this chapter.');
        }

        $scope = ['chapter_id' => $chapterId, 'user_id' => $request->user()->id, 'operation' => $operation, 'key' => $key, 'evidence_scope' => ''];
        $fingerprint = CanonicalJson::sha256([$poId, $amendmentId, $input]);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $receipts = ActionReceipt::where($scope);

        if ($existing = (clone $receipts)->first()) {
            return $this->replay($existing, $fingerprint, $authority);
        }

        $before = null;
        try {
            return DB::transaction(function () use ($request, $poId, $amendmentId, $operation, $input, $scope, $fingerprint, $authority, $receipts, &$before) {
                $chapter = $authority->chapter->id;
                $repfId = $operation === 'createPurchaseOrder'
                    ? $input['repf_id']
                    : PurchaseOrder::where('chapter_id', $chapter)->whereKey($poId)->value('repf_id');

                if ($repfId === null) {
                    if ($existing = (clone $receipts)->sharedLock()->first()) {
                        return $this->replay($existing, $fingerprint, $authority);
                    }
                    throw RepfWorkflow::notFound();
                }

                // Acyclic lock order: RepF FOR UPDATE -> PurchaseOrder FOR UPDATE -> ActionReceipt sharedLock -> sequence last.
                $repf = Repf::where('chapter_id', $chapter)->whereKey($repfId)->lockForUpdate()->first()
                    ?? throw RepfWorkflow::notFound();
                $po = $poId === null ? null : (
                    PurchaseOrder::where('chapter_id', $chapter)->where('repf_id', $repf->id)->whereKey($poId)->lockForUpdate()->first()
                    ?? throw RepfWorkflow::notFound()
                );

                if ($existing = (clone $receipts)->sharedLock()->first()) {
                    return $this->replay($existing, $fingerprint, $authority);
                }

                $now = now('UTC');
                $actor = RepfResource::actor($request->user());
                $operationId = (string) Str::uuid();
                $fromStatus = $po?->status;
                $repfFromStatus = $repf->status;
                $repfChanged = false;
                $historyReason = null;
                $historyAmendmentId = null;

                if ($po !== null) {
                    $before = PurchaseOrderResource::format($po->load(self::RELATIONS), $authority);
                    if ($po->version !== $input['expected_version'] || $po->material_version !== $input['expected_material_version']) {
                        throw QuotationPolicy::conflict('version_conflict', 'Read the current Purchase Order before trying again.', $before);
                    }
                }

                $selection = $this->findSelection($repf, $po?->supplier_selection_id ?? $input['supplier_selection_id']);
                $status = $operation === 'createPurchaseOrder' || $operation === 'proposePurchaseOrderAmendment' ? 201 : 200;
                $resourceKind = 'purchase_order';
                $amendmentModel = null;

                switch ($operation) {
                    case 'createPurchaseOrder':
                        $po = $this->createDraft($repf, $selection, $input, $scope['user_id']);
                        break;

                    case 'replacePurchaseOrder':
                        $this->replaceDraft($po, $repf, $selection, $input, $now);
                        break;

                    case 'submitPurchaseOrder':
                        $this->submitDraft($po, $repf, $selection, $actor, $now);
                        break;

                    case 'approvePurchaseOrder':
                        $this->approveAndIssue($po, $repf, $selection, $input, $authority, $actor, $now);
                        $historyReason = $input['approval_notes'];
                        $repfChanged = true;
                        break;

                    case 'returnPurchaseOrder':
                    case 'rejectPurchaseOrder':
                        $this->reviewDecision($po, $repf, $operation, $input['reason'], $authority, $actor, $now);
                        $historyReason = $input['reason'];
                        break;

                    case 'recordPurchaseOrderAcknowledgment':
                        $this->recordAcknowledgment($po, $input, $actor, $now);
                        break;

                    case 'proposePurchaseOrderAmendment':
                        $amendmentModel = $this->proposeAmendment($po, $repf, $selection, $input, $scope['user_id'], $now);
                        $resourceKind = 'purchase_order_amendment';
                        $historyReason = $input['reason'];
                        $historyAmendmentId = $amendmentModel->id;
                        break;

                    case 'approvePurchaseOrderAmendment':
                        [$amendmentModel, $repfChanged] = $this->approveAmendment(
                            $po, $repf, $selection, $amendmentId, $input, $authority, $scope['user_id'], $now
                        );
                        $resourceKind = 'purchase_order_amendment';
                        $historyReason = $input['approval_notes'] ?? $amendmentModel->reason;
                        $historyAmendmentId = $amendmentModel->id;
                        break;

                    case 'closeShortPurchaseOrder':
                        $this->closeShort($po, $repf, $input['reason'], $authority, $actor, $now);
                        $historyReason = $input['reason'];
                        break;

                    case 'cancelPurchaseOrder':
                        $repfChanged = $this->cancelPo($po, $repf, $input['reason'], $authority, $actor, $now);
                        $historyReason = $input['reason'];
                        break;
                }

                $po->load(self::RELATIONS);
                $snapshot = PurchaseOrderResource::format($po, $authority, enforceEvidenceRead: false);
                $responsePo = PurchaseOrderResource::redactEvidence($snapshot, $authority);

                $payload = $resourceKind === 'purchase_order_amendment'
                    ? ['purchase_order' => $responsePo, 'amendment' => PurchaseOrderResource::amendment($amendmentModel->load(['proposer', 'approver']))]
                    : $responsePo;
                $resourceId = $resourceKind === 'purchase_order_amendment' ? $amendmentModel->id : $po->id;

                $result = ['data' => [
                    'operation_id' => $operationId,
                    'chapter_id' => $chapter,
                    'actor_id' => $scope['user_id'],
                    'operation_name' => $operation,
                    'action_key' => $scope['key'],
                    'resource_kind' => $resourceKind,
                    'resource_id' => $resourceId,
                    'committed_version' => (int) $po->version,
                    'committed_material_version' => (int) $po->material_version,
                    'status_code' => $status,
                    'committed_at' => RepfResource::instant($now),
                    'outcome' => 'committed',
                    'result' => $payload,
                ]];

                ActionReceipt::create($scope + [
                    'id' => $operationId, 'fingerprint' => $fingerprint, 'status' => $status, 'result' => $result,
                ]);

                $history = self::history($po);
                $history->create([
                    'chapter_id' => $chapter,
                    'record_kind' => 'purchase_order',
                    'record_id' => $po->id,
                    'sequence_no' => ((int) (clone $history)->max('sequence_no')) + 1,
                    'version' => (int) $po->version,
                    'material_version' => (int) $po->material_version,
                    'is_version_snapshot' => true,
                    'event_type' => $operation,
                    'actor_user_id' => $scope['user_id'],
                    'reason' => $historyReason,
                    'snapshot_json' => $snapshot,
                    'operation_json' => [
                        'operation_id' => $operationId,
                        'from_status' => $fromStatus,
                        'amendment_id' => $historyAmendmentId,
                        'actor' => $actor,
                    ],
                    'recorded_at' => $now,
                ]);

                if ($repfChanged) {
                    $repfSnapshot = (new RepfResource($repf->load(RepfWorkflow::RELATIONS)))->resolve($request);
                    $repfHistory = RepfWorkflow::history($repf);
                    $repfHistory->create([
                        'chapter_id' => $chapter,
                        'record_kind' => 'repf',
                        'record_id' => $repf->id,
                        'sequence_no' => ((int) (clone $repfHistory)->max('sequence_no')) + 1,
                        'version' => (int) $repf->version,
                        'material_version' => (int) $repf->material_version,
                        'is_version_snapshot' => true,
                        'event_type' => 'po_ordered_progress',
                        'actor_user_id' => $scope['user_id'],
                        'reason' => $historyReason,
                        'snapshot_json' => $repfSnapshot,
                        'operation_json' => ['operation_id' => $operationId, 'from_status' => $repfFromStatus, 'po_id' => $po->id, 'actor' => $actor],
                        'recorded_at' => $now,
                    ]);
                    $this->outbox->recordIntent('stage2.repf.changed.v1', $chapter, $repf->id, (int) $repf->version, (int) $repf->material_version);
                }

                $this->outbox->recordIntent('stage2.purchase-order.changed.v1', $chapter, $po->id, (int) $po->version, (int) $po->material_version);

                return response()->json($result, $status, ['X-Action-Replayed' => 'false']);
            });
        } catch (UniqueConstraintViolationException $exception) {
            $existing = (clone $receipts)->sharedLock()->first();
            if ($existing === null) {
                throw $exception;
            }

            return $this->replay($existing, $fingerprint, $authority);
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

    private function createDraft(Repf $repf, array $selection, array $input, string $userId): PurchaseOrder
    {
        if (! in_array($repf->status, ['approved', 'partially_ordered'], true)) {
            throw QuotationPolicy::conflict('source_not_eligible', 'Purchase Orders require an approved or partially_ordered RepF.');
        }

        $quote = RepfQuotation::where('chapter_id', $repf->chapter_id)->where('repf_id', $repf->id)
            ->whereKey($selection['selected_quotation_id'])->sharedLock()->first() ?? throw RepfWorkflow::notFound();
        [$builtLines, $total] = $this->validateDraftLines($repf, $quote, $input['lines']);

        QuotationPolicy::evaluate(
            $repf->chapter_id,
            $total,
            (int) $selection['comparable_quote_count'],
            (bool) $selection['emergency_waiver_used'],
        );
        $this->checkBudgetCeiling($repf, null, $total);

        $anyLineCanceled = collect($builtLines)->contains('linked_demand_canceled', true);
        $canceledAt = collect($builtLines)->pluck('linked_demand_canceled_at')->filter()->sort()->first();
        $po = PurchaseOrder::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $repf->chapter_id,
            'status' => 'draft',
            'version' => 1,
            'material_version' => 1,
            'repf_id' => $repf->id,
            'supplier_selection_id' => $selection['id'],
            'selected_quotation_id' => $quote->id,
            'po_reference' => null,
            'prepared_by' => $userId,
            'supplier' => $quote->supplier,
            'delivery_location' => $input['delivery_location'],
            'expected_delivery_date' => $input['expected_delivery_date'],
            'payment_and_delivery_terms' => $input['payment_and_delivery_terms'],
            'total_amount_php' => $total,
            'emergency_waiver_used' => (bool) $selection['emergency_waiver_used'],
            'linked_demand_canceled' => $anyLineCanceled,
            'linked_demand_canceled_at' => $anyLineCanceled ? $canceledAt : null,
        ]);

        foreach ($builtLines as $line) {
            $po->lines()->create($line + ['po_id' => $po->id, 'repf_id' => $repf->id]);
        }

        return $po;
    }

    private function replaceDraft(PurchaseOrder $po, Repf $repf, array $selection, array $input, $now): void
    {
        if (! in_array($po->status, ['draft', 'returned_for_revision'], true)) {
            throw QuotationPolicy::conflict('invalid_transition', 'Only draft or returned_for_revision Purchase Orders may be replaced.');
        }
        if (! in_array($repf->status, ['approved', 'partially_ordered'], true)) {
            throw QuotationPolicy::conflict('source_not_eligible', 'The originating RepF is no longer eligible for ordering.');
        }

        $quote = RepfQuotation::where('chapter_id', $repf->chapter_id)->where('repf_id', $repf->id)
            ->whereKey($po->selected_quotation_id)->sharedLock()->first() ?? throw RepfWorkflow::notFound();
        [$builtLines, $total] = $this->validateDraftLines($repf, $quote, $input['lines']);

        QuotationPolicy::evaluate(
            $repf->chapter_id,
            $total,
            (int) $selection['comparable_quote_count'],
            (bool) $po->emergency_waiver_used,
        );
        $this->checkBudgetCeiling($repf, $po->id, $total);

        $po->fill([
            'status' => 'draft',
            'version' => $po->version + 1,
            'material_version' => $po->material_version + 1,
            'delivery_location' => $input['delivery_location'],
            'expected_delivery_date' => $input['expected_delivery_date'],
            'payment_and_delivery_terms' => $input['payment_and_delivery_terms'],
            'total_amount_php' => $total,
            'review_json' => [],
        ]);
        $po->updated_at = $now;
        $po->save();

        $po->lines()->delete();
        foreach ($builtLines as $line) {
            $po->lines()->create($line + ['po_id' => $po->id, 'repf_id' => $repf->id]);
        }
    }

    private function submitDraft(PurchaseOrder $po, Repf $repf, array $selection, array $actor, $now): void
    {
        if ($po->status !== 'draft') {
            throw QuotationPolicy::conflict('invalid_transition', 'Only draft Purchase Orders may be submitted.');
        }
        if (! in_array($repf->status, ['approved', 'partially_ordered'], true)) {
            throw QuotationPolicy::conflict('source_not_eligible', 'The originating RepF is no longer eligible for ordering.');
        }

        $this->checkRepfRemainingQuantities($repf, $po->lines()->get());
        QuotationPolicy::evaluate(
            $repf->chapter_id,
            (string) $po->total_amount_php,
            (int) $selection['comparable_quote_count'],
            (bool) $po->emergency_waiver_used,
        );
        $this->checkBudgetCeiling($repf, $po->id, (string) $po->total_amount_php);

        $po->status = 'pending_approval';
        $po->version++;
        $po->review_json = ['submitted_by' => $actor, 'submitted_at' => RepfResource::instant($now)];
        $po->updated_at = $now;
        $po->save();
    }

    private function approveAndIssue(
        PurchaseOrder $po,
        Repf $repf,
        array $selection,
        array $input,
        ChapterAuthority $authority,
        array $actor,
        $now,
    ): void {
        $this->requireIndependence($authority, [$po->prepared_by, $repf->prepared_by], 'PO approval requires an officer independent of both the PO preparer and the originating RepF preparer.');
        if ($po->status !== 'pending_approval') {
            throw QuotationPolicy::conflict('invalid_transition', 'Only pending_approval Purchase Orders may be approved.');
        }

        $evaluation = QuotationPolicy::evaluate(
            $repf->chapter_id,
            (string) $po->total_amount_php,
            (int) $selection['comparable_quote_count'],
            (bool) $po->emergency_waiver_used,
        );

        $allowedDuties = $this->approvalDuties('po.approve', $evaluation, (bool) $po->emergency_waiver_used);
        $this->requireDutyAndLimit($authority, $allowedDuties, (string) $po->total_amount_php);

        if (! in_array($repf->status, ['approved', 'partially_ordered'], true)) {
            throw QuotationPolicy::conflict('source_not_eligible', 'The originating RepF is no longer eligible for ordering.');
        }
        $poLines = $po->lines()->get();
        $this->checkRepfRemainingQuantities($repf, $poLines);
        $this->checkBudgetCeiling($repf, $po->id, (string) $po->total_amount_php);

        if ($po->po_reference === null) {
            $po->po_reference = $this->sequences->nextReference($repf->chapter_id, 'PO')['reference'];
        }

        $at = RepfResource::instant($now);
        $review = $po->review_json ?? [];
        $po->status = 'issued';
        $po->version++;
        $po->issued_at = $now;
        $po->review_json = array_replace($review, [
            'approved_by' => $actor,
            'approved_at' => $at,
            'review_decision_reason' => null,
        ]);
        $po->updated_at = $now;
        $po->save();

        // Update originating RepF ordered progress atomically.
        $deltas = $this->sumByRepfLine($poLines);
        $this->applyRepfOrderedDeltas($repf, $deltas, $now);
    }

    private function reviewDecision(
        PurchaseOrder $po,
        Repf $repf,
        string $operation,
        string $reason,
        ChapterAuthority $authority,
        array $actor,
        $now,
    ): void {
        $this->requireIndependence($authority, [$po->prepared_by, $repf->prepared_by], 'PO review requires an officer independent of both the PO preparer and the originating RepF preparer.');
        if ($po->status !== 'pending_approval') {
            throw QuotationPolicy::conflict('invalid_transition', 'Only pending_approval Purchase Orders may be returned or rejected.');
        }

        $review = $po->review_json ?? [];
        $po->status = $operation === 'returnPurchaseOrder' ? 'returned_for_revision' : 'rejected';
        $po->version++;
        $po->review_json = array_replace($review, [
            'review_decision_reason' => $reason,
        ]);
        $po->updated_at = $now;
        $po->save();
    }

    private function recordAcknowledgment(PurchaseOrder $po, array $input, array $actor, $now): void
    {
        if (! in_array($po->status, ['issued', 'partially_received'], true)) {
            throw QuotationPolicy::conflict('invalid_transition', 'Supplier acknowledgment requires an issued or partially_received Purchase Order.');
        }

        $binding = $input['evidence'] === null ? null : $this->evidence->verifyCurrentBytes(
            $po->chapter_id,
            $input['evidence'],
            'quotation_attachment',
            fn (EvidenceRecord $record) => $record->record_id === $po->id,
        );

        $po->acknowledgment = [
            'supplier_confirmation_reference' => $input['supplier_confirmation_reference'],
            'acknowledged_at' => $input['acknowledged_at'],
            'revised_expected_delivery_date' => $input['revised_expected_delivery_date'],
            'notes' => $input['notes'],
            'evidence_binding' => $binding,
            'recorded_by' => $actor,
            'recorded_at' => RepfResource::instant($now),
        ];
        $po->revised_expected_delivery_date = $input['revised_expected_delivery_date'];
        $po->version++;
        $po->updated_at = $now;
        $po->save();
    }

    private function proposeAmendment(
        PurchaseOrder $po,
        Repf $repf,
        array $selection,
        array $input,
        string $userId,
        $now,
    ): PurchaseOrderAmendment {
        if (! in_array($po->status, ['issued', 'partially_received'], true)) {
            throw QuotationPolicy::conflict('invalid_transition', 'Amendments require an issued or partially_received Purchase Order.');
        }
        if ($po->amendments()->where('status', 'pending_approval')->exists()) {
            throw QuotationPolicy::conflict('invalid_transition', 'At most one pending amendment is allowed per Purchase Order.');
        }

        [$proposedTotal] = $this->validateAmendmentLines($po, $repf, $input['lines']);

        QuotationPolicy::evaluate(
            $repf->chapter_id,
            $proposedTotal,
            (int) $selection['comparable_quote_count'],
            (bool) $po->emergency_waiver_used,
        );
        $this->checkBudgetCeiling($repf, $po->id, $proposedTotal);

        $nextNumber = ((int) $po->amendments()->max('amendment_number')) + 1;
        $amendment = PurchaseOrderAmendment::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $po->chapter_id,
            'po_id' => $po->id,
            'amendment_number' => $nextNumber,
            'status' => 'pending_approval',
            'base_material_version' => (int) $po->material_version,
            'applied_material_version' => null,
            'delivery_location' => $input['delivery_location'],
            'expected_delivery_date' => $input['expected_delivery_date'],
            'payment_and_delivery_terms' => $input['payment_and_delivery_terms'],
            'proposed_total_php' => $proposedTotal,
            'reason' => $input['reason'],
            'lines' => $input['lines'],
            'proposed_by' => $userId,
            'proposed_at' => $now,
            'approved_by' => null,
            'approved_at' => null,
        ]);

        $po->version++;
        $po->updated_at = $now;
        $po->save();

        return $amendment;
    }

    /** @return array{PurchaseOrderAmendment, bool} */
    private function approveAmendment(
        PurchaseOrder $po,
        Repf $repf,
        array $selection,
        string $amendmentId,
        array $input,
        ChapterAuthority $authority,
        string $userId,
        $now,
    ): array {
        $amendment = PurchaseOrderAmendment::where('chapter_id', $po->chapter_id)->where('po_id', $po->id)
            ->whereKey($amendmentId)->lockForUpdate()->first() ?? throw RepfWorkflow::notFound();

        $this->requireIndependence(
            $authority,
            [$amendment->proposed_by, $po->prepared_by, $repf->prepared_by],
            'PO amendment approval requires an officer independent of the amendment proposer, PO preparer, and originating RepF preparer.',
        );

        if (! in_array($po->status, ['issued', 'partially_received'], true) || $amendment->status !== 'pending_approval') {
            throw QuotationPolicy::conflict('invalid_transition', 'Only a pending amendment on an issued or partially_received PO may be approved.');
        }

        [$proposedTotal, $resolvedLines, $deltas] = $this->validateAmendmentLines($po, $repf, $amendment->lines);

        $evaluation = QuotationPolicy::evaluate(
            $repf->chapter_id,
            $proposedTotal,
            (int) $selection['comparable_quote_count'],
            (bool) $po->emergency_waiver_used,
        );

        $allowedDuties = $this->approvalDuties('po.amend_approve', $evaluation, (bool) $po->emergency_waiver_used);
        $this->requireDutyAndLimit($authority, $allowedDuties, $proposedTotal);
        $this->checkBudgetCeiling($repf, $po->id, $proposedTotal);

        $existingById = $po->lines()->get()->keyBy('id');
        $keptIds = [];
        foreach ($resolvedLines as $resolved) {
            if ($resolved['po_line_id'] !== null) {
                $existing = $existingById->get($resolved['po_line_id']);
                $keptIds[] = $existing->id;
                $sameItem = $existing->variant_id === $resolved['variant_id'] && $existing->unit_id === $resolved['unit_id'];
                $outstanding = BigDecimal::of($resolved['ordered_quantity'])
                    ->minus($existing->accepted_quantity)
                    ->minus($existing->closed_short_quantity)
                    ->minus($existing->canceled_quantity);
                $existing->update([
                    'repf_line_id' => $resolved['repf_line_id'],
                    'quotation_line_id' => $sameItem ? $existing->quotation_line_id : null,
                    'variant_id' => $resolved['variant_id'],
                    'unit_id' => $resolved['unit_id'],
                    'quantity_scale' => $resolved['quantity_scale'],
                    'ordered_quantity' => $resolved['ordered_quantity'],
                    'outstanding_quantity' => (string) $outstanding->toScale($resolved['quantity_scale']),
                    'unit_price_php' => $resolved['unit_price_php'],
                    'line_total_php' => $resolved['line_total_php'],
                    'specifications' => $resolved['specifications'],
                    'notes' => $resolved['notes'],
                ]);
            } else {
                $created = $po->lines()->create([
                    'id' => (string) Str::uuid(),
                    'po_id' => $po->id,
                    'repf_id' => $repf->id,
                    'repf_line_id' => $resolved['repf_line_id'],
                    'quotation_line_id' => null,
                    'variant_id' => $resolved['variant_id'],
                    'unit_id' => $resolved['unit_id'],
                    'quantity_scale' => $resolved['quantity_scale'],
                    'ordered_quantity' => $resolved['ordered_quantity'],
                    'accepted_quantity' => '0',
                    'rejected_or_disputed_quantity' => '0',
                    'closed_short_quantity' => '0',
                    'canceled_quantity' => '0',
                    'outstanding_quantity' => $resolved['ordered_quantity'],
                    'unit_price_php' => $resolved['unit_price_php'],
                    'line_total_php' => $resolved['line_total_php'],
                    'specifications' => $resolved['specifications'],
                    'notes' => $resolved['notes'],
                    'linked_demand_canceled' => $resolved['linked_demand_canceled'],
                    'linked_demand_canceled_at' => $resolved['linked_demand_canceled_at'],
                ]);
                $keptIds[] = $created->id;
            }
        }
        $po->lines()->whereNotIn('id', $keptIds)->delete();

        $po->version++;
        $po->material_version++;
        $po->delivery_location = $amendment->delivery_location;
        $po->expected_delivery_date = $amendment->expected_delivery_date;
        $po->payment_and_delivery_terms = $amendment->payment_and_delivery_terms;
        $po->total_amount_php = $proposedTotal;
        $po->updated_at = $now;
        $po->save();

        $amendment->status = 'approved';
        $amendment->applied_material_version = (int) $po->material_version;
        $amendment->approved_by = $userId;
        $amendment->approved_at = $now;
        $amendment->save();

        $hasNonZeroDelta = collect($deltas)->contains(fn (BigDecimal $delta) => ! $delta->isZero());
        $repfChanged = false;
        if ($hasNonZeroDelta && $repf->status !== 'canceled') {
            $this->applyRepfOrderedDeltas($repf, $deltas, $now);
            $repfChanged = true;
        }

        return [$amendment, $repfChanged];
    }

    private function closeShort(
        PurchaseOrder $po,
        Repf $repf,
        string $reason,
        ChapterAuthority $authority,
        array $actor,
        $now,
    ): void {
        $this->requireIndependence($authority, [$po->prepared_by, $repf->prepared_by], 'Closing short a PO requires an officer independent of both the PO preparer and the originating RepF preparer.');
        if (! in_array($po->status, ['issued', 'partially_received'], true)) {
            throw QuotationPolicy::conflict('invalid_transition', 'Only issued or partially_received Purchase Orders may be closed short.');
        }
        if ($po->amendments()->where('status', 'pending_approval')->exists()) {
            throw QuotationPolicy::conflict('invalid_transition', 'Resolve the pending amendment before closing short this Purchase Order.');
        }
        $this->requireDutyAndLimit($authority, ChapterAuthority::ACTION_DUTIES['po.close_short'], (string) $po->total_amount_php);

        foreach ($po->lines()->get() as $line) {
            $closedShort = BigDecimal::of($line->closed_short_quantity)->plus($line->outstanding_quantity)->toScale((int) $line->quantity_scale);
            $line->update([
                'closed_short_quantity' => (string) $closedShort,
                'outstanding_quantity' => (string) BigDecimal::zero()->toScale((int) $line->quantity_scale),
            ]);
        }

        $review = $po->review_json ?? [];
        $po->status = 'closed_short';
        $po->version++;
        $po->review_json = array_replace($review, [
            'closed_short_by' => $actor,
            'closed_short_at' => RepfResource::instant($now),
            'close_short_reason' => $reason,
        ]);
        $po->updated_at = $now;
        $po->save();
    }

    private function cancelPo(
        PurchaseOrder $po,
        Repf $repf,
        string $reason,
        ChapterAuthority $authority,
        array $actor,
        $now,
    ): bool {
        $lines = $po->lines()->get();
        $hasAccepted = $po->status === 'partially_received'
            || $lines->contains(fn (PurchaseOrderLine $line) => BigDecimal::of($line->accepted_quantity)->isGreaterThan(0));
        if ($hasAccepted) {
            throw QuotationPolicy::conflict('po_has_accepted_receipts', 'Purchase Order already has accepted receipts; use close-short instead.');
        }
        if (! in_array($po->status, ['draft', 'returned_for_revision', 'issued'], true)) {
            throw QuotationPolicy::conflict('invalid_transition', 'The current Purchase Order status cannot be canceled.');
        }
        if ($po->amendments()->where('status', 'pending_approval')->exists()) {
            throw QuotationPolicy::conflict('invalid_transition', 'Resolve the pending amendment before canceling this Purchase Order.');
        }

        $wasIssued = $po->status === 'issued';
        if ($wasIssued) {
            $authority->requireAction('po.approve');
            $this->requireIndependence($authority, [$po->prepared_by, $repf->prepared_by], 'Canceling an issued PO requires an officer independent of both the PO preparer and the originating RepF preparer.');
        }

        $deltas = [];
        foreach ($lines as $line) {
            $scale = (int) $line->quantity_scale;
            $canceled = BigDecimal::of($line->canceled_quantity)->plus($line->outstanding_quantity)->toScale($scale);
            if ($wasIssued) {
                $deltas[$line->repf_line_id] = ($deltas[$line->repf_line_id] ?? BigDecimal::zero())->minus($line->ordered_quantity);
            }
            $line->update([
                'canceled_quantity' => (string) $canceled,
                'outstanding_quantity' => (string) BigDecimal::zero()->toScale($scale),
            ]);
        }

        $review = $po->review_json ?? [];
        $po->status = 'canceled';
        $po->version++;
        $po->review_json = array_replace($review, [
            'canceled_by' => $actor,
            'canceled_at' => RepfResource::instant($now),
            'cancel_reason' => $reason,
        ]);
        $po->updated_at = $now;
        $po->save();

        if ($wasIssued && $repf->status !== 'canceled' && $deltas !== []) {
            $this->applyRepfOrderedDeltas($repf, $deltas, $now);

            return true;
        }

        return false;
    }

    /** @return array{list<array<string, mixed>>, string} */
    private function validateDraftLines(Repf $repf, RepfQuotation $quote, array $inputLines): array
    {
        $repfLines = $repf->lines()->get()->keyBy('id');
        $quoteLines = collect($quote->lines ?? [])->keyBy('id');
        $variants = CatalogueVariant::where('chapter_id', $repf->chapter_id)
            ->whereIn('id', array_column($inputLines, 'variant_id'))->orderBy('id')->sharedLock()->get()->keyBy('id');
        $items = CatalogueItem::where('chapter_id', $repf->chapter_id)
            ->whereIn('id', $variants->pluck('item_id'))->orderBy('id')->sharedLock()->get()->keyBy('id');
        $units = CatalogueUnit::where('chapter_id', $repf->chapter_id)
            ->whereIn('id', array_column($inputLines, 'unit_id'))->orderBy('id')->sharedLock()->get()->keyBy('id');

        $built = [];
        $requestedByRepfLine = [];
        foreach ($inputLines as $i => $line) {
            $repfLine = $repfLines->get($line['repf_line_id']) ?? throw RepfWorkflow::notFound();
            $quoteLine = $quoteLines->get($line['quotation_line_id']) ?? throw RepfWorkflow::notFound();
            $variant = $variants->get($line['variant_id']) ?? throw RepfWorkflow::notFound();
            $item = $items->get($variant->item_id) ?? throw RepfWorkflow::notFound();
            $unit = $units->get($line['unit_id']) ?? throw RepfWorkflow::notFound();

            if ($unit->id !== $variant->unit_id || $unit->state !== 'active' || $variant->state !== 'active'
                || ! $variant->is_active || $item->state !== 'active' || ! $item->is_active) {
                throw QuotationPolicy::conflict('source_not_eligible', 'The selected variant and unit must be active and compatible.');
            }
            if ($quoteLine['repf_line_id'] !== $repfLine->id || $line['variant_id'] !== $repfLine->variant_id
                || $line['unit_id'] !== $repfLine->unit_id || $quoteLine['variant_id'] !== $variant->id
                || $quoteLine['unit_id'] !== $unit->id) {
                throw QuotationPolicy::conflict('source_not_eligible', 'PO line must match the originating RepF line and selected quotation line.');
            }
            if (BigDecimal::of($line['ordered_quantity'])->getScale() !== (int) $variant->quantity_scale) {
                throw OpeningDraftInput::invalidInput([RepfInput::field("/lines/$i/ordered_quantity", 'Use the approved variant quantity scale.')]);
            }

            $lineTotal = BigDecimal::of($line['ordered_quantity'])->multipliedBy($line['unit_price_php'])->toScale(2, RoundingMode::HalfUp);
            if ($lineTotal->isGreaterThan('999999999999.99')) {
                throw OpeningDraftInput::invalidInput([RepfInput::field("/lines/$i/unit_price_php", 'The line total exceeds the supported maximum.')]);
            }

            $requestedByRepfLine[$repfLine->id] = ($requestedByRepfLine[$repfLine->id] ?? BigDecimal::zero())->plus($line['ordered_quantity']);
            $built[] = [
                'id' => (string) Str::uuid(),
                'repf_line_id' => $repfLine->id,
                'quotation_line_id' => $quoteLine['id'],
                'variant_id' => $variant->id,
                'unit_id' => $unit->id,
                'quantity_scale' => (int) $variant->quantity_scale,
                'ordered_quantity' => $line['ordered_quantity'],
                'accepted_quantity' => '0',
                'rejected_or_disputed_quantity' => '0',
                'closed_short_quantity' => '0',
                'canceled_quantity' => '0',
                'outstanding_quantity' => $line['ordered_quantity'],
                'unit_price_php' => $line['unit_price_php'],
                'line_total_php' => (string) $lineTotal,
                'specifications' => $line['specifications'],
                'notes' => $line['notes'],
                'linked_demand_canceled' => (bool) $repfLine->linked_demand_canceled,
                'linked_demand_canceled_at' => $repfLine->linked_demand_canceled_at,
            ];
        }

        foreach ($requestedByRepfLine as $repfLineId => $sum) {
            $remaining = BigDecimal::of($repfLines->get($repfLineId)->remaining_to_order_quantity);
            if ($sum->isGreaterThan($remaining)) {
                throw QuotationPolicy::conflict('source_not_eligible', 'Ordered quantity exceeds remaining orderable quantity on the originating RepF line.');
            }
        }

        $total = BigDecimal::sum(...array_column($built, 'line_total_php'));
        if ($total->isGreaterThan('999999999999.99')) {
            throw OpeningDraftInput::invalidInput([RepfInput::field('/lines', 'The Purchase Order total exceeds the supported maximum.')]);
        }

        return [$built, (string) $total];
    }

    /** @return array{string, list<array<string, mixed>>, array<string, BigDecimal>} */
    private function validateAmendmentLines(PurchaseOrder $po, Repf $repf, array $inputLines): array
    {
        $existingLines = $po->lines()->get()->keyBy('id');
        $repfLines = $repf->lines()->get()->keyBy('id');
        $variants = CatalogueVariant::where('chapter_id', $repf->chapter_id)
            ->whereIn('id', array_column($inputLines, 'variant_id'))->orderBy('id')->sharedLock()->get()->keyBy('id');
        $items = CatalogueItem::where('chapter_id', $repf->chapter_id)
            ->whereIn('id', $variants->pluck('item_id'))->orderBy('id')->sharedLock()->get()->keyBy('id');
        $units = CatalogueUnit::where('chapter_id', $repf->chapter_id)
            ->whereIn('id', array_column($inputLines, 'unit_id'))->orderBy('id')->sharedLock()->get()->keyBy('id');

        $seenPoLines = [];
        $resolved = [];
        $proposedByRepfLine = [];
        foreach ($inputLines as $i => $line) {
            $poLineId = $line['po_line_id'];
            $existing = null;
            if ($poLineId !== null) {
                if (isset($seenPoLines[$poLineId])) {
                    throw OpeningDraftInput::invalidInput([RepfInput::field("/lines/$i/po_line_id", 'Duplicate PO line identifier.')]);
                }
                $seenPoLines[$poLineId] = true;
                $existing = $existingLines->get($poLineId) ?? throw RepfWorkflow::notFound();
            }

            $repfLine = $repfLines->get($line['repf_line_id']) ?? throw RepfWorkflow::notFound();
            $variant = $variants->get($line['variant_id']) ?? throw RepfWorkflow::notFound();
            $item = $items->get($variant->item_id) ?? throw RepfWorkflow::notFound();
            $unit = $units->get($line['unit_id']) ?? throw RepfWorkflow::notFound();

            if ($existing !== null && BigDecimal::of($existing->accepted_quantity)->isGreaterThan(0)) {
                if ($line['variant_id'] !== $existing->variant_id || $line['unit_id'] !== $existing->unit_id
                    || $line['repf_line_id'] !== $existing->repf_line_id) {
                    throw QuotationPolicy::conflict('po_has_accepted_receipts', 'Variant, unit, or RepF linkage cannot change on a PO line with accepted receipts.');
                }
                if (BigDecimal::of($line['ordered_quantity'])->isLessThan($existing->accepted_quantity)) {
                    throw QuotationPolicy::conflict('po_has_accepted_receipts', 'Proposed ordered_quantity cannot be reduced below accepted_quantity.');
                }
            }

            if ($unit->id !== $variant->unit_id || $unit->state !== 'active' || $variant->state !== 'active'
                || ! $variant->is_active || $item->state !== 'active' || ! $item->is_active) {
                throw QuotationPolicy::conflict('source_not_eligible', 'The selected variant and unit must be active and compatible.');
            }
            if (BigDecimal::of($line['ordered_quantity'])->getScale() !== (int) $variant->quantity_scale) {
                throw OpeningDraftInput::invalidInput([RepfInput::field("/lines/$i/ordered_quantity", 'Use the approved variant quantity scale.')]);
            }

            $lineTotal = BigDecimal::of($line['ordered_quantity'])->multipliedBy($line['unit_price_php'])->toScale(2, RoundingMode::HalfUp);
            if ($lineTotal->isGreaterThan('999999999999.99')) {
                throw OpeningDraftInput::invalidInput([RepfInput::field("/lines/$i/unit_price_php", 'The line total exceeds the supported maximum.')]);
            }

            $proposedByRepfLine[$repfLine->id] = ($proposedByRepfLine[$repfLine->id] ?? BigDecimal::zero())->plus($line['ordered_quantity']);
            $resolved[] = [
                'po_line_id' => $poLineId,
                'repf_line_id' => $repfLine->id,
                'variant_id' => $variant->id,
                'unit_id' => $unit->id,
                'quantity_scale' => (int) $variant->quantity_scale,
                'ordered_quantity' => $line['ordered_quantity'],
                'unit_price_php' => $line['unit_price_php'],
                'line_total_php' => (string) $lineTotal,
                'specifications' => $line['specifications'],
                'notes' => $line['notes'],
                'linked_demand_canceled' => (bool) $repfLine->linked_demand_canceled,
                'linked_demand_canceled_at' => $repfLine->linked_demand_canceled_at,
            ];
        }

        // Cannot drop any existing PO line that already has accepted receipts.
        foreach ($existingLines as $existing) {
            if (! isset($seenPoLines[$existing->id]) && BigDecimal::of($existing->accepted_quantity)->isGreaterThan(0)) {
                throw QuotationPolicy::conflict('po_has_accepted_receipts', 'Cannot remove a PO line that already has accepted receipts.');
            }
        }

        // Compute RepF ordered quantity deltas and verify remaining orderable bounds.
        $currentByRepfLine = $this->sumByRepfLine($existingLines);
        $deltas = [];
        $allRepfLineIds = array_unique([...array_keys($currentByRepfLine), ...array_keys($proposedByRepfLine)]);
        foreach ($allRepfLineIds as $repfLineId) {
            $delta = ($proposedByRepfLine[$repfLineId] ?? BigDecimal::zero())->minus($currentByRepfLine[$repfLineId] ?? BigDecimal::zero());
            $deltas[$repfLineId] = $delta;
            if ($delta->isGreaterThan(0)) {
                $repfLine = $repfLines->get($repfLineId);
                if ($repf->status === 'canceled' || ! $repfLine || $delta->isGreaterThan($repfLine->remaining_to_order_quantity)) {
                    throw QuotationPolicy::conflict('source_not_eligible', 'Amended ordered quantity exceeds remaining orderable quantity on the originating RepF.');
                }
            }
        }

        $total = BigDecimal::sum(...array_column($resolved, 'line_total_php'));
        if ($total->isGreaterThan('999999999999.99')) {
            throw OpeningDraftInput::invalidInput([RepfInput::field('/lines', 'The amended Purchase Order total exceeds the supported maximum.')]);
        }

        return [(string) $total, $resolved, $deltas];
    }

    private function checkRepfRemainingQuantities(Repf $repf, Collection $poLines): void
    {
        $repfLines = $repf->lines()->get()->keyBy('id');
        foreach ($this->sumByRepfLine($poLines) as $repfLineId => $ordered) {
            $repfLine = $repfLines->get($repfLineId);
            if (! $repfLine || $ordered->isGreaterThan($repfLine->remaining_to_order_quantity)) {
                throw QuotationPolicy::conflict('source_not_eligible', 'PO line ordered quantity exceeds remaining orderable quantity on the originating RepF.');
            }
        }
    }

    private function checkBudgetCeiling(Repf $repf, ?string $excludePoId, string $candidateTotal): void
    {
        if ($repf->approved_budget_php === null) {
            throw QuotationPolicy::conflict('source_not_eligible', 'Originating RepF does not have an approved budget.');
        }

        $otherCommitted = PurchaseOrder::where('chapter_id', $repf->chapter_id)
            ->where('repf_id', $repf->id)
            ->whereIn('status', self::COMMITTED_BUDGET_STATUSES)
            ->when($excludePoId !== null, fn ($q) => $q->where('id', '!=', $excludePoId))
            ->sharedLock()
            ->pluck('total_amount_php');

        $cumulative = BigDecimal::of($candidateTotal);
        foreach ($otherCommitted as $amount) {
            $cumulative = $cumulative->plus($amount);
        }

        if ($cumulative->isGreaterThan($repf->approved_budget_php)) {
            throw QuotationPolicy::conflict('budget_limit_exceeded', 'Cumulative PO commitments would exceed approved RepF approved_budget_php ceiling.');
        }
    }

    /** @param array<string, BigDecimal> $deltas */
    private function applyRepfOrderedDeltas(Repf $repf, array $deltas, $now): void
    {
        $repfLines = $repf->lines()->get();
        foreach ($repfLines as $repfLine) {
            $delta = $deltas[$repfLine->id] ?? null;
            if ($delta === null || $delta->isZero()) {
                continue;
            }
            $scale = (int) $repfLine->quantity_scale;
            $newOrdered = BigDecimal::max(BigDecimal::zero(), BigDecimal::of($repfLine->ordered_quantity)->plus($delta))->toScale($scale);
            $newRemaining = BigDecimal::max(BigDecimal::zero(), BigDecimal::of($repfLine->remaining_to_order_quantity)->minus($delta))->toScale($scale);
            $repfLine->update([
                'ordered_quantity' => (string) $newOrdered,
                'remaining_to_order_quantity' => (string) $newRemaining,
            ]);
        }

        $freshLines = $repf->lines()->get();
        $anyOrdered = $freshLines->contains(fn ($line) => BigDecimal::of($line->ordered_quantity)->isGreaterThan(0));
        $anyRemaining = $freshLines->contains(fn ($line) => BigDecimal::of($line->remaining_to_order_quantity)->isGreaterThan(0));
        $repf->status = ! $anyOrdered ? 'approved' : ($anyRemaining ? 'partially_ordered' : 'ordered');
        $repf->version++;
        $repf->updated_at = $now;
        $repf->save();
    }

    /** @return array<string, BigDecimal> */
    private function sumByRepfLine(Collection $poLines): array
    {
        $totals = [];
        foreach ($poLines as $line) {
            $totals[$line->repf_line_id] = ($totals[$line->repf_line_id] ?? BigDecimal::zero())->plus($line->ordered_quantity);
        }

        return $totals;
    }

    private function findSelection(Repf $repf, string $selectionId): array
    {
        $selection = $repf->supplier_selection_json['selections'][$selectionId] ?? null;
        if (! is_array($selection)) {
            throw RepfWorkflow::notFound();
        }

        return $selection;
    }

    /** @param list<string> $excludedUserIds */
    private function requireIndependence(ChapterAuthority $authority, array $excludedUserIds, string $message): void
    {
        if (in_array($authority->membership->user_id, $excludedUserIds, true)) {
            throw new ContractException(403, 'independence_required', $message);
        }
    }

    /** @return list<string> */
    private function approvalDuties(string $action, array $evaluation, bool $waiverUsed): array
    {
        $base = ChapterAuthority::ACTION_DUTIES[$action];
        if (! $waiverUsed) {
            return $base;
        }

        return array_values(array_intersect($base, $evaluation['approving_duties_for_waiver'] ?? []));
    }

    /** @param list<string> $allowedDuties */
    private function requireDutyAndLimit(ChapterAuthority $authority, array $allowedDuties, string $amountPhp): void
    {
        $matchingGrants = $authority->grants->filter(
            fn ($grant) => ! $grant->is_alternate && in_array($grant->duty_code, $allowedDuties, true)
        );
        if ($matchingGrants->isEmpty()) {
            throw new ContractException(403, 'duty_denied', 'Current duty does not permit approving this Purchase Order.');
        }
        if (! $matchingGrants->contains(fn ($grant) => ChapterAuthority::covers($grant, null, $amountPhp))) {
            throw new ContractException(403, 'duty_limit_exceeded', 'Purchase Order total_amount_php exceeds the active duty grant monetary limit.');
        }
    }

    private function replay(ActionReceipt $receipt, string $fingerprint, ChapterAuthority $authority): JsonResponse
    {
        if (! hash_equals($receipt->fingerprint, $fingerprint)) {
            throw QuotationPolicy::conflict('action_key_conflict', 'Use a new action key for changed input.');
        }
        if ($receipt->operation === 'cancelPurchaseOrder' && ($receipt->result['data']['result']['po_reference'] ?? null) !== null) {
            $authority->requireAction('po.approve');
        }

        return response()->json($receipt->result, $receipt->status, ['X-Action-Replayed' => 'true']);
    }

    public static function history(PurchaseOrder $po): Builder
    {
        return Stage2RecordHistory::where('chapter_id', $po->chapter_id)
            ->where('record_kind', 'purchase_order')
            ->where('record_id', $po->id);
    }
}
