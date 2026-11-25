<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Models\IdempotencyRecord;
use App\Models\InternalRf;
use App\Models\InternalRfVersion;
use App\Services\Authority\ChapterAuthority;
use App\Services\Inventory\InternalRfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class InternalRfController extends Controller
{
    public function __construct(
        protected InternalRfService $rfService
    ) {}

    public function listInternalRfs(Request $request, string $chapterId): JsonResponse
    {
        $allowedStatuses = ['draft', 'submitted', 'approved', 'returned', 'canceled'];
        $status = $request->query('status');
        if ($status !== null && ! in_array($status, $allowedStatuses, true)) {
            return response()->json([
                'error' => ['code' => 'invalid_filter', 'message' => "Invalid status filter '{$status}'."],
            ], 400, ['Cache-Control' => 'no-store']);
        }

        $query = InternalRf::where('chapter_id', $chapterId)->with('lines');

        if ($status !== null) {
            $query->where('status', $status);
        }
        if ($request->filled('fulfillment')) {
            $query->where('fulfillment_status', $request->query('fulfillment'));
        }
        if ($request->filled('requester_id')) {
            $query->where('requester_user_id', $request->query('requester_id'));
        }
        if ($request->filled('requesting_unit_id')) {
            $query->where('requesting_unit_id', $request->query('requesting_unit_id'));
        }
        if ($request->filled('event_id')) {
            $query->where('event_id', $request->query('event_id'));
        }

        $authority = $request->attributes->get(ChapterAuthority::class);
        $rfs = $query->orderByDesc('created_at')->get()->filter(fn (InternalRf $rf) => $authority->canReadRf($rf));
        $data = $rfs->map(fn (InternalRf $rf) => $this->rfService->formatRf($rf))->values();

        return response()->json([
            'data' => $data,
            'page' => [
                'has_more' => false,
                'next_cursor' => null,
                'total_elements' => $data->count(),
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function createInternalRf(Request $request, string $chapterId): JsonResponse
    {
        $actorId = $this->actorId($request);
        $actionKey = $this->actionKey($request);

        try {
            $envelope = $this->rfService->createDraft($chapterId, $actorId, $request->all(), $actionKey);

            return response()->json($envelope, 201, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return response()->json($e->toArray((string) Str::uuid()), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    public function readInternalRf(string $chapterId, string $rfId): JsonResponse
    {
        $rf = InternalRf::where('chapter_id', $chapterId)->where('id', $rfId)->with('lines')->first();
        if (! $rf) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => "Internal RF {$rfId} not found."],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        return response()->json([
            'data' => $this->rfService->formatRf($rf),
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function replaceInternalRfDraft(Request $request, string $chapterId, string $rfId): JsonResponse
    {
        $actorId = $this->actorId($request);
        $actionKey = $this->actionKey($request);

        try {
            $envelope = $this->rfService->replaceDraft($chapterId, $rfId, $actorId, $request->all(), $actionKey);

            return response()->json($envelope, 200, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return response()->json($e->toArray((string) Str::uuid()), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    public function submitInternalRf(Request $request, string $chapterId, string $rfId): JsonResponse
    {
        $actorId = $this->actorId($request);
        $actionKey = $this->actionKey($request);

        try {
            $envelope = $this->rfService->submit($chapterId, $rfId, $actorId, $request->all(), $actionKey, $request->attributes->get(ChapterAuthority::class));

            return response()->json($envelope, 200, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return response()->json($e->toArray((string) Str::uuid()), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    public function approveInternalRf(Request $request, string $chapterId, string $rfId): JsonResponse
    {
        $actorId = $this->actorId($request);
        $actionKey = $this->actionKey($request);

        try {
            $envelope = $this->rfService->approve($chapterId, $rfId, $actorId, $request->all(), $actionKey, $request->attributes->get(ChapterAuthority::class));

            return response()->json($envelope, 200, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return response()->json($e->toArray((string) Str::uuid()), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    public function returnInternalRf(Request $request, string $chapterId, string $rfId): JsonResponse
    {
        $actorId = $this->actorId($request);
        $actionKey = $this->actionKey($request);

        try {
            $envelope = $this->rfService->returnForRevision($chapterId, $rfId, $actorId, $request->all(), $actionKey, $request->attributes->get(ChapterAuthority::class));

            return response()->json($envelope, 200, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return response()->json($e->toArray((string) Str::uuid()), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    public function reviseInternalRf(Request $request, string $chapterId, string $rfId): JsonResponse
    {
        $actorId = $this->actorId($request);
        $actionKey = $this->actionKey($request);

        try {
            $envelope = $this->rfService->revise($chapterId, $rfId, $actorId, $request->all(), $actionKey);

            return response()->json($envelope, 200, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return response()->json($e->toArray((string) Str::uuid()), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    public function cancelInternalRf(Request $request, string $chapterId, string $rfId): JsonResponse
    {
        $actorId = $this->actorId($request);
        $actionKey = $this->actionKey($request);

        try {
            $envelope = $this->rfService->cancel($chapterId, $rfId, $actorId, $request->all(), $actionKey);

            return response()->json($envelope, 200, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return response()->json($e->toArray((string) Str::uuid()), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    public function listInternalRfHistory(Request $request, string $chapterId, string $rfId): JsonResponse
    {
        $rf = InternalRf::where('chapter_id', $chapterId)->where('id', $rfId)->first();
        if (! $rf) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => "Internal RF {$rfId} not found."],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $versions = InternalRfVersion::where('chapter_id', $chapterId)
            ->where('rf_id', $rfId)
            ->orderBy('version')
            ->get()
            ->filter(fn (InternalRfVersion $version) => $this->canReadSnapshot($request, $rf, $version));

        return response()->json([
            'data' => $versions->map(fn (InternalRfVersion $v) => [
                'id' => $v->id,
                'rf_id' => $v->rf_id,
                'version' => $v->version,
                'material_version' => $v->material_version,
                'progress_version' => $v->progress_version,
                'event_type' => $v->event_type,
                'actor_id' => $v->actor_user_id,
                'reason' => $v->reason,
                'snapshot' => $v->snapshot_json,
                'created_at' => $v->created_at?->format('Y-m-d\TH:i:s.u\Z'),
            ])->values(),
            'page' => ['has_more' => false, 'next_cursor' => null, 'total_elements' => $versions->count()],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function readInternalRfVersion(Request $request, string $chapterId, string $rfId, string $version): JsonResponse
    {
        $rf = InternalRf::where('chapter_id', $chapterId)->where('id', $rfId)->first();
        if (! $rf) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => "Internal RF {$rfId} not found."],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $verRow = InternalRfVersion::where('chapter_id', $chapterId)
            ->where('rf_id', $rfId)
            ->where('version', (int) $version)
            ->first();

        if (! $verRow || ! $this->canReadSnapshot($request, $rf, $verRow)) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => "RF version {$version} not found."],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        return response()->json([
            'data' => [
                'id' => $verRow->id,
                'rf_id' => $verRow->rf_id,
                'version' => $verRow->version,
                'material_version' => $verRow->material_version,
                'progress_version' => $verRow->progress_version,
                'event_type' => $verRow->event_type,
                'actor_id' => $verRow->actor_user_id,
                'reason' => $verRow->reason,
                'snapshot' => $verRow->snapshot_json,
                'created_at' => $verRow->created_at?->format('Y-m-d\TH:i:s.u\Z'),
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function listInternalRfRelatedRecords(Request $request, string $chapterId, string $rfId): JsonResponse
    {
        try {
            $related = $this->rfService->getRelatedRecords($chapterId, $rfId, $request->attributes->get(ChapterAuthority::class));

            return response()->json(['data' => $related], 200, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return response()->json($e->toArray((string) Str::uuid()), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    public function findInternalRfOperationResult(Request $request, string $chapterId): JsonResponse
    {
        $key = $request->query('action_key') ?? $request->query('key') ?? $request->header('X-Action-Key');
        if (! $key) {
            return response()->json([
                'error' => ['code' => 'missing_key', 'message' => 'action_key is required.'],
            ], 400, ['Cache-Control' => 'no-store']);
        }

        $actorId = $request->user()->id;
        $query = IdempotencyRecord::where('chapter_id', $chapterId)->where('key', $key);
        if ($actorId) {
            $query->where('user_id', $actorId);
        }

        $record = $query->first();
        if (! $record || ! $this->canReadReceipt($request, $record)) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Operation result not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        if ($record->state === 'in_flight') {
            return response()->json([
                'error' => ['code' => 'operation_in_flight', 'message' => 'Operation is still in flight.'],
            ], 409, ['Cache-Control' => 'no-store']);
        }

        $decoded = json_decode($record->response_body, true);

        return response()->json($decoded ?? ['data' => $record->response_body], 200, ['Cache-Control' => 'no-store']);
    }

    public function readInternalRfOperationResult(Request $request, string $chapterId, string $operationId): JsonResponse
    {
        $actorId = $request->user()->id;
        $query = IdempotencyRecord::where('chapter_id', $chapterId)->where('id', $operationId);
        if ($actorId) {
            $query->where('user_id', $actorId);
        }

        $record = $query->first();
        if (! $record || ! $this->canReadReceipt($request, $record)) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Operation result not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $decoded = json_decode($record->response_body, true);

        return response()->json($decoded ?? ['data' => $record->response_body], 200, ['Cache-Control' => 'no-store']);
    }

    private function canReadSnapshot(Request $request, InternalRf $rf, InternalRfVersion $version): bool
    {
        $authority = $request->attributes->get(ChapterAuthority::class);
        $unit = $version->snapshot_json['requesting_unit_id'] ?? null;

        $decision = $unit === $rf->requesting_unit_id && ! $authority->allows('history.read', $unit)
            ? $authority->rfDecisionScope($rf) : null;

        return $authority->allows('rf.read', $unit, $decision) && $authority->allows('history.read', $unit, $decision);
    }

    private function canReadReceipt(Request $request, IdempotencyRecord $record): bool
    {
        $action = match ($record->operation_name) {
            'createInternalRf', 'replaceInternalRfDraft', 'reviseInternalRf', 'cancelInternalRf' => 'rf.draft',
            'submitInternalRf' => 'rf.submit',
            'approveInternalRf', 'returnInternalRf' => 'rf.approve',
            default => null,
        };
        if ($action === null || ! $record->resource_id) {
            return false;
        }

        $authority = $request->attributes->get(ChapterAuthority::class);
        $rf = InternalRf::where('chapter_id', $record->chapter_id)->whereKey($record->resource_id)->first();
        $oldUnit = data_get(json_decode($record->response_body, true), 'data.result.requesting_unit_id');

        if (! $rf || ! $authority->canReadRf($rf)) {
            return false;
        }
        $approver = $action === 'rf.approve' ? $authority->routedRfApprover($rf) : null;
        if ($action === 'rf.approve' && ! $approver) {
            return false;
        }
        $decision = $approver && $oldUnit === $rf->requesting_unit_id ? $authority->rfDecisionScope($rf) : null;

        return $authority->allows($action, $rf->requesting_unit_id, $decision) && $authority->allows($action, $oldUnit, $decision);
    }

    private function actorId(Request $request): string
    {
        return (string) ($request->user()->id);
    }

    private function actionKey(Request $request): ?string
    {
        return $request->header('Idempotency-Key')
            ?? $request->header('X-Action-Key')
            ?? $request->header('X-Idempotency-Key');
    }
}
