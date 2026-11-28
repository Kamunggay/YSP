<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Http\Requests\ReceivingInput;
use App\Http\Resources\ReceivingResource;
use App\Http\Resources\RepfResource;
use App\Models\ReceivingDiscrepancy;
use App\Models\ReceivingHold;
use App\Models\Stage2RecordHistory;
use App\Models\User;
use App\Services\Authority\ChapterAuthority;
use App\Services\Receiving\ReceivingExceptionWorkflow;
use App\Services\Receiving\ReceivingReportWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReceivingDiscrepancyAndHoldController
{
    public function indexDiscrepancies(Request $request, string $chapterId): JsonResponse
    {
        $selectors = ReceivingInput::selectors($request, ['limit', 'cursor', 'status', 'source_kind', 'rm_id', 'source_id', 'q', 'eligible_for']);
        $query = ReceivingDiscrepancy::where('chapter_id', $chapterId)
            ->with(ReceivingExceptionWorkflow::DISCREPANCY_RELATIONS);

        if (isset($selectors['status'])) {
            $query->where('status', $this->oneOf($selectors['status'], ReceivingInput::DISCREPANCY_STATUSES));
        }
        if (isset($selectors['source_kind'])) {
            $query->where('source_kind', $this->oneOf($selectors['source_kind'], ReceivingInput::SOURCE_KINDS));
        }
        if (isset($selectors['rm_id'])) {
            $rmId = OpeningDraftInput::requireUuid($selectors['rm_id'], 'receiving report identifier');
            $query->where(fn ($q) => $q->where('rm_id', $rmId)->orWhere('replacement_rm_id', $rmId));
        }
        if (isset($selectors['source_id'])) {
            $query->where('source_id', OpeningDraftInput::requireUuid($selectors['source_id'], 'source identifier'));
        }

        $eligibleFor = isset($selectors['eligible_for'])
            ? $this->oneOf($selectors['eligible_for'], ReceivingInput::DISCREPANCY_ELIGIBLE_FOR)
            : null;
        if ($eligibleFor === 'supplier_notification') {
            $query->where('source_kind', 'po')->where('status', 'open');
        } elseif ($eligibleFor === 'resolution') {
            $query->whereIn('status', ['open', 'supplier_notified', 'under_review']);
        }

        $search = ReceivingReportController::parseSearch($selectors);
        $rows = $query->orderByDesc('updated_at')->orderBy('id')->sharedLock()->get();
        if ($search !== null) {
            $rows = $rows->filter(fn (ReceivingDiscrepancy $disc) => $this->matchesDiscrepancySearch($disc, $search));
        }

        $items = $rows->map(ReceivingResource::discrepancy(...))->values()->all();

        return ReceivingReportController::page($request, $chapterId, 'receiving-discrepancies', $selectors, $items);
    }

    public function showDiscrepancy(Request $request, string $chapterId, string $discrepancyId): JsonResponse
    {
        ReceivingInput::selectors($request);
        OpeningDraftInput::requireUuid($discrepancyId, 'receiving discrepancy identifier');
        $discrepancy = ReceivingDiscrepancy::where('chapter_id', $chapterId)
            ->whereKey($discrepancyId)
            ->with(ReceivingExceptionWorkflow::DISCREPANCY_RELATIONS)
            ->sharedLock()
            ->first() ?? throw ReceivingReportWorkflow::notFound();

        return response()->json(['data' => ReceivingResource::discrepancy($discrepancy)]);
    }

    public function mutateDiscrepancy(Request $request, ReceivingExceptionWorkflow $workflow, string $chapterId, string $discrepancyId): JsonResponse
    {
        OpeningDraftInput::requireUuid($discrepancyId, 'receiving discrepancy identifier');
        $operation = $request->route()->getName();
        [$key, $input] = ReceivingInput::write($request, $operation);

        return $workflow->mutateDiscrepancy($request, $chapterId, $discrepancyId, $operation, $key, $input);
    }

    public function indexHolds(Request $request, string $chapterId): JsonResponse
    {
        $authority = $request->attributes->get(ChapterAuthority::class);
        $selectors = ReceivingInput::selectors($request, ['limit', 'cursor', 'status', 'q', 'eligible_for']);
        $query = ReceivingHold::where('chapter_id', $chapterId)
            ->with(ReceivingExceptionWorkflow::HOLD_RELATIONS);

        if (isset($selectors['status'])) {
            $query->where('status', $this->oneOf($selectors['status'], ReceivingInput::HOLD_STATUSES));
        }
        $eligibleFor = isset($selectors['eligible_for'])
            ? $this->oneOf($selectors['eligible_for'], ReceivingInput::HOLD_ELIGIBLE_FOR)
            : null;
        if ($eligibleFor === 'source_link') {
            $query->where('status', 'held');
        } elseif ($eligibleFor === 'receiving_draft') {
            $query->where('status', 'linked_to_source');
        }

        $search = ReceivingReportController::parseSearch($selectors);
        $rows = $query->orderByDesc('updated_at')->orderBy('id')->sharedLock()->get();
        if ($search !== null) {
            $rows = $rows->filter(fn (ReceivingHold $hold) => $this->matchesHoldSearch($hold, $search));
        }

        $items = $rows->map(fn (ReceivingHold $hold) => ReceivingResource::hold($hold, $authority))->values()->all();

        return ReceivingReportController::page($request, $chapterId, 'receiving-holds', $selectors, $items);
    }

    public function showHold(Request $request, string $chapterId, string $holdId): JsonResponse
    {
        ReceivingInput::selectors($request);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $hold = $this->findHold($chapterId, $holdId)->load(ReceivingExceptionWorkflow::HOLD_RELATIONS);

        return response()->json(['data' => ReceivingResource::hold($hold, $authority)]);
    }

    public function holdHistory(Request $request, string $chapterId, string $holdId): JsonResponse
    {
        $selectors = ReceivingInput::selectors($request, ['limit', 'cursor']);
        $hold = $this->findHold($chapterId, $holdId);
        $rows = ReceivingExceptionWorkflow::holdHistory($hold)
            ->where('is_version_snapshot', true)
            ->orderByDesc('version')
            ->orderByDesc('sequence_no')
            ->orderByDesc('id')
            ->sharedLock()
            ->get();
        $actors = User::whereIn('id', $rows->pluck('actor_user_id')->unique())->get()->keyBy('id');

        $items = $rows->map(fn (Stage2RecordHistory $row) => [
            'id' => $row->id,
            'version' => (int) $row->version,
            'material_version' => (int) $row->material_version,
            'action' => $row->event_type,
            'from_status' => $row->operation_json['from_status'] ?? null,
            'to_status' => $row->snapshot_json['status'],
            'actor' => $row->operation_json['actor'] ?? RepfResource::actor($actors->get($row->actor_user_id)),
            'reason' => (string) ($row->reason ?? ''),
            'linked_source_reference' => $row->operation_json['linked_source_reference'] ?? null,
            'occurred_at' => RepfResource::instant($row->recorded_at),
        ])->values()->all();

        return ReceivingReportController::page($request, $chapterId, "receiving-hold-history:{$holdId}", $selectors, $items);
    }

    public function mutateHold(Request $request, ReceivingExceptionWorkflow $workflow, string $chapterId, ?string $holdId = null): JsonResponse
    {
        if ($holdId !== null) {
            OpeningDraftInput::requireUuid($holdId, 'receiving hold identifier');
        }
        $operation = $request->route()->getName();
        [$key, $input] = ReceivingInput::write($request, $operation);

        return $workflow->mutateHold($request, $chapterId, $holdId, $operation, $key, $input);
    }

    private function findHold(string $chapterId, string $holdId): ReceivingHold
    {
        OpeningDraftInput::requireUuid($holdId, 'receiving hold identifier');

        return ReceivingHold::where('chapter_id', $chapterId)->whereKey($holdId)->sharedLock()->first()
            ?? throw ReceivingReportWorkflow::notFound();
    }

    private function matchesDiscrepancySearch(ReceivingDiscrepancy $disc, string $search): bool
    {
        $haystacks = [
            $disc->id,
            $disc->receivingReport?->rm_reference,
            $disc->receivingReport?->source_reference,
            $disc->replacementReceivingReport?->rm_reference,
            $disc->discrepancy_notes,
            $disc->supplier_notification['supplier_contact_reference'] ?? null,
            $disc->supplier_notification['notification_notes'] ?? null,
            $disc->review_json['review_notes'] ?? null,
            $disc->resolution['reason'] ?? null,
            $disc->variant?->code ?? $disc->variant?->sku,
            $disc->variant?->name ?? $disc->variant?->label,
            $disc->variant?->item?->code,
            $disc->variant?->item?->name,
        ];
        foreach ($haystacks as $value) {
            if (is_string($value) && $value !== '' && mb_stripos($value, $search) !== false) {
                return true;
            }
        }

        return false;
    }

    private function matchesHoldSearch(ReceivingHold $hold, string $search): bool
    {
        $haystacks = [
            $hold->id,
            $hold->carrier_or_sender_name,
            $hold->delivery_document_reference,
            $hold->hold_reason,
            $hold->linked_source['source_reference'] ?? null,
            $hold->linked_source['supplier_dr_reference'] ?? null,
            $hold->rejection_return['recipient_or_carrier_name'] ?? null,
            $hold->holdingLocation?->code,
            $hold->holdingLocation?->name,
        ];
        foreach ((array) ($hold->items ?? []) as $item) {
            $haystacks[] = $item['item_description'] ?? null;
            $haystacks[] = $item['condition_notes'] ?? null;
        }
        foreach ($haystacks as $value) {
            if (is_string($value) && $value !== '' && mb_stripos($value, $search) !== false) {
                return true;
            }
        }

        return false;
    }

    private function oneOf(string $value, array $choices): string
    {
        if (! in_array($value, $choices, true)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid receiving selector.');
        }

        return $value;
    }
}
