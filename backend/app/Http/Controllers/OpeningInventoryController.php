<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Models\EvidenceBinding;
use App\Models\EvidenceRecord;
use App\Models\IdempotencyRecord;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\OpeningCount;
use App\Models\OpeningRecordHistory;
use App\Models\OpeningRm;
use App\Services\Authority\ChapterAuthority;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Inventory\OpeningDraftService;
use App\Services\Inventory\Participants\PrepareOpeningInventoryParticipant;
use App\Services\Inventory\StockViewQueryService;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\CanonicalJson;
use App\Services\Shared\ReferenceSequenceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class OpeningInventoryController extends Controller
{
    public function __construct(
        protected PrepareOpeningInventoryParticipant $openingParticipant,
        protected StockViewQueryService $stockViewService,
        protected ?CheckEvidenceBindingParticipant $checkEvidenceBinding = null,
        protected ?ReferenceSequenceService $referenceSequences = null,
        protected ?DomainNotificationOutboxService $outbox = null,
        protected ?OpeningDraftService $drafts = null
    ) {
        $this->checkEvidenceBinding = $checkEvidenceBinding ?? app(CheckEvidenceBindingParticipant::class);
        $this->referenceSequences = $referenceSequences ?? app(ReferenceSequenceService::class);
        $this->outbox = $outbox ?? app(DomainNotificationOutboxService::class);
        $this->drafts = $drafts ?? app(OpeningDraftService::class);
    }

    // ==========================================
    // IPC ENDPOINTS
    // ==========================================

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs
     */
    public function listIpcs(Request $request, string $chapterId): JsonResponse
    {
        return $this->drafts->listIpcs($request, $chapterId);
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/ipcs
     */
    public function createIpc(Request $request, string $chapterId): JsonResponse
    {
        return $this->drafts->createIpc($request, $chapterId);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}
     */
    public function readIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        return $this->drafts->readIpc($request, $chapterId, $ipcId);
    }

    /**
     * PUT /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/my-count
     */
    public function saveMyIpcCount(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        return $this->drafts->saveMyIpcCount($request, $chapterId, $ipcId);
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/submit
     */
    public function submitIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        return $this->drafts->submitIpc($request, $chapterId, $ipcId);
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/authorizations
     */
    public function authorizeIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        return $this->drafts->authorizeIpc($request, $chapterId, $ipcId);
    }

    /**
     * PUT /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}
     */
    public function replaceIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        return $this->drafts->replaceIpc($request, $chapterId, $ipcId);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/history
     */
    public function listIpcHistory(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        return $this->drafts->listIpcHistory($request, $chapterId, $ipcId);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/versions/{revision}
     */
    public function readIpcRevision(Request $request, string $chapterId, string $ipcId, string $revision): JsonResponse
    {
        return $this->drafts->readIpcRevision($request, $chapterId, $ipcId, $revision);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/related
     */
    public function readIpcRelated(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        return $this->drafts->readIpcRelated($request, $chapterId, $ipcId);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/print
     */
    public function printIpc(Request $request, string $chapterId, string $ipcId): Response
    {
        return $this->drafts->printIpc($request, $chapterId, $ipcId);
    }

    // ==========================================
    // OPENING RM ENDPOINTS
    // ==========================================

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms
     */
    public function listOpeningRms(Request $request, string $chapterId): JsonResponse
    {
        return $this->drafts->listOpeningRms($request, $chapterId);
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/opening-rms
     */
    public function createOpeningRm(Request $request, string $chapterId): JsonResponse
    {
        return $this->drafts->createOpeningRm($request, $chapterId);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}
     */
    public function readOpeningRm(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        return $this->drafts->readOpeningRm($request, $chapterId, $rmId);
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/inspection
     */
    public function inspectOpeningRm(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        return $this->drafts->inspectOpeningRm($request, $chapterId, $rmId);
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/evidence-match
     */
    public function matchOpeningRmEvidence(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        return $this->drafts->matchOpeningRmEvidence($request, $chapterId, $rmId);
    }

    private function hasPublishedOpeningPaper(OpeningRm $rm): bool
    {
        return EvidenceRecord::where('chapter_id', $rm->chapter_id)->where('purpose', 'opening_receipt')
            ->where('record_id', $rm->id)->sharedLock()->first(['id']) !== null;
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/post
     * Atomic commit of opening baseline movements & singleton fence (RCV-10, T-18, A-18).
     */
    public function postOpeningRm(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        $alreadyPosted = OpeningRm::where('chapter_id', $chapterId)
            ->where('status', 'POSTED')
            ->exists();

        if ($alreadyPosted) {
            return response()->json([
                'error' => 'BASELINE_ALREADY_POSTED',
                'message' => 'An opening baseline has already been posted for chapter (RCV-10, T-18, A-18).',
            ], 409, ['Cache-Control' => 'no-store']);
        }

        $rm = OpeningRm::where('chapter_id', $chapterId)
            ->where('id', $rmId)
            ->first();

        if (! $rm) {
            return response()->json([
                'error' => 'OPENING_RM_NOT_FOUND',
                'message' => "Opening RM {$rmId} was not found in chapter {$chapterId}.",
            ], 404, ['Cache-Control' => 'no-store']);
        }

        if ($rm->status === 'POSTED') {
            return response()->json([
                'error' => 'BASELINE_ALREADY_POSTED',
                'message' => 'Opening RM is already posted (RCV-10, T-18, A-18).',
            ], 409, ['Cache-Control' => 'no-store']);
        }

        $userId = $request->user()->id;
        $actionKey = $request->header('Idempotency-Key')
            ?? $request->header('X-Action-Key')
            ?? $request->header('X-Idempotency-Key');

        return DB::transaction(function () use ($chapterId, $rm, $userId, $actionKey, $request) {
            $postedCheck = OpeningRm::where('chapter_id', $chapterId)
                ->where('status', 'POSTED')
                ->lockForUpdate()
                ->first();

            if ($postedCheck) {
                return response()->json([
                    'error' => 'BASELINE_ALREADY_POSTED',
                    'message' => 'An opening baseline has already been posted for chapter (RCV-10, T-18, A-18).',
                ], 409, ['Cache-Control' => 'no-store']);
            }

            $rm = OpeningRm::where('chapter_id', $chapterId)->whereKey($rm->id)->lockForUpdate()->firstOrFail();
            $binding = $rm->evidence_binding_id
                ? EvidenceBinding::where('chapter_id', $chapterId)->whereKey($rm->evidence_binding_id)->sharedLock()->first()
                : null;
            if ($binding?->match_projection) {
                $ipc = OpeningCount::where('chapter_id', $chapterId)->whereKey($rm->ipc_id)->sharedLock()->first();
                if ($request->input('expected_revision') !== $rm->revision || $request->input('material_version') !== $rm->material_version
                    || ! $ipc || OpeningDraftService::ipcState($ipc) !== 'authorized' || $request->input('ipc_material_version') !== $ipc->material_version
                    || ($rm->snapshot_data['ipc_material_version'] ?? null) !== $ipc->material_version) {
                    throw new ContractException(409, 'version_conflict', 'The approved opening snapshot has changed.');
                }
                if ($request->input('acknowledgment_id') !== $binding->id || $binding->status !== 'active') {
                    throw new ContractException(409, 'evidence_mismatch', 'Match the current signed paper before posting.');
                }
                $this->checkEvidenceBinding->verifyMatch(
                    $chapterId, $userId, $rm->evidenceSnapshot(),
                    $binding->match_projection['bytes'], $binding->match_projection, [],
                );
            } elseif ($request->has('acknowledgment_id') || $this->hasPublishedOpeningPaper($rm)) {
                throw new ContractException(409, 'acknowledgment_missing', 'Match the current signed paper before posting.');
            }

            if (! $rm->rm_number) {
                $seq = $this->referenceSequences->nextReference($chapterId, 'RM');
                $rm->rm_number = $seq['reference'];
            }

            $posting = $this->openingParticipant->execute(
                chapterId: $chapterId,
                openingRm: $rm,
                actorId: $userId
            );

            $rm->status = 'POSTED';
            $rm->posted_at = now();
            $rm->revision += 1;
            $rm->save();

            $ipc = $rm->ipc;
            if ($ipc) {
                $ipc->status = 'POSTED';
                $ipc->revision += 1;
                $ipc->save();
                $this->recordOpeningHistory('IPC', $ipc->id, $chapterId, $ipc->revision, $ipc->material_version, 'posted', $userId, $ipc->toArray());
                $this->outbox->recordIntent('stage1.ipc.changed.v1', $chapterId, $ipc->id, $ipc->revision, $ipc->material_version);
            }

            $this->recordOpeningHistory('OPENING_RM', $rm->id, $chapterId, $rm->revision, $rm->material_version, 'posted', $userId, $rm->toArray());
            $this->outbox->recordIntent('stage1.opening-rm.changed.v1', $chapterId, $rm->id, $rm->revision, $rm->material_version);
            $this->outbox->recordIntent('stage1.opening-baseline.changed.v1', $chapterId, $chapterId, $rm->revision, $rm->material_version);

            $lots = InventoryLot::where('chapter_id', $chapterId)->where('source_id', $rm->id)->get();
            foreach ($lots as $lot) {
                $this->outbox->recordIntent('stage1.stock-lot.changed.v1', $chapterId, $lot->id, $lot->stock_version, $lot->material_version);
            }

            $responseBody = [
                'data' => [
                    'record' => $rm,
                    'posting' => $posting,
                ],
            ];

            if ($actionKey) {
                $rawContent = $request->getContent();
                $decoded = $rawContent !== '' ? json_decode($rawContent, true) : null;
                $payloadHash = (json_last_error() === JSON_ERROR_NONE && is_array($decoded))
                    ? CanonicalJson::sha256($decoded)
                    : hash('sha256', $rawContent);

                IdempotencyRecord::firstOrCreate(
                    ['key' => $actionKey],
                    [
                        'id' => (string) Str::uuid(),
                        'chapter_id' => $chapterId,
                        'user_id' => $userId,
                        'operation_name' => 'postOpeningRm',
                        'resource_id' => $rm->id,
                        'state' => 'committed',
                        'payload_hash' => $payloadHash,
                        'response_code' => 200,
                        'response_body' => json_encode($responseBody),
                        'expires_at' => now()->addDays(7),
                    ]
                );
            }

            return response()->json($responseBody, 200, ['Cache-Control' => 'no-store']);
        });
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-baseline
     */
    public function readChapterOpeningBaseline(Request $request, string $chapterId): JsonResponse
    {
        $postedRm = OpeningRm::where('chapter_id', $chapterId)
            ->where('status', 'POSTED')
            ->first();

        if (! $postedRm) {
            return response()->json([
                'data' => null,
            ], 200, ['Cache-Control' => 'no-store']);
        }

        $movements = InventoryMovement::where('chapter_id', $chapterId)
            ->whereHas('posting', fn ($q) => $q->where('source_id', $postedRm->id))
            ->get();

        return response()->json([
            'data' => [
                'baseline' => $postedRm,
                'movements' => $movements,
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/movements
     */
    public function listOpeningRmMovements(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        $rm = OpeningRm::where('chapter_id', $chapterId)->where('id', $rmId)->first();
        if (! $rm) {
            return response()->json(['error' => 'NOT_FOUND'], 404, ['Cache-Control' => 'no-store']);
        }

        $movements = InventoryMovement::where('chapter_id', $chapterId)
            ->whereHas('posting', fn ($q) => $q->where('source_id', $rmId))
            ->get();

        return response()->json([
            'data' => $movements,
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/findings
     */
    public function listOpeningRmFindings(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        $rm = OpeningRm::where('chapter_id', $chapterId)->where('id', $rmId)->first();
        if (! $rm) {
            return response()->json(['error' => 'NOT_FOUND'], 404, ['Cache-Control' => 'no-store']);
        }

        $findings = InventoryLot::where('chapter_id', $chapterId)
            ->whereIn('condition', ['QUARANTINE', 'REJECTED'])
            ->get();

        return response()->json([
            'data' => $findings,
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * PUT /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}
     */
    public function replaceOpeningRm(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        return $this->drafts->replaceOpeningRm($request, $chapterId, $rmId);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/history
     */
    public function listOpeningRmHistory(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        return $this->drafts->listOpeningRmHistory($request, $chapterId, $rmId);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/versions/{revision}
     */
    public function readOpeningRmRevision(Request $request, string $chapterId, string $rmId, string $revision): JsonResponse
    {
        return $this->drafts->readOpeningRmRevision($request, $chapterId, $rmId, $revision);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/related
     */
    public function readOpeningRmRelated(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        return $this->drafts->readOpeningRmRelated($request, $chapterId, $rmId);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/print
     */
    public function printOpeningRm(Request $request, string $chapterId, string $rmId): Response
    {
        return $this->drafts->printOpeningRm($request, $chapterId, $rmId);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-actions/by-key
     */
    public function findOpeningActionByKey(Request $request, string $chapterId): JsonResponse
    {
        $key = $request->header('X-Action-Key') ?? $request->query('action_key') ?? $request->query('key');
        if (! $key) {
            return response()->json([
                'error' => ['code' => 'missing_key', 'message' => 'action_key is required.'],
            ], 400, ['Cache-Control' => 'no-store']);
        }

        $userId = $request->user()->id;
        $query = IdempotencyRecord::where('chapter_id', $chapterId)->where('key', $key);
        $record = $query->where('user_id', $userId)->first();
        if (! $record || ! $this->canReadAction($request, $record)) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Opening action key not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        if ($record->state === 'in_flight') {
            return response()->json([
                'error' => ['code' => 'operation_in_flight', 'message' => 'Opening action is still in flight.'],
            ], 409, ['Cache-Control' => 'no-store']);
        }

        $decoded = json_decode($record->response_body, true);

        return response()->json([
            'data' => [
                'operation_id' => $record->id,
                'action_key' => $record->key,
                'chapter_id' => $record->chapter_id,
                'operation_name' => $record->operation_name,
                'status' => $record->state ?? 'committed',
                'http_status' => $record->response_code,
                'result' => $decoded['data'] ?? $decoded ?? $record->response_body,
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-actions/{operation_id}
     */
    public function readOpeningAction(Request $request, string $chapterId, string $operationId): JsonResponse
    {
        $userId = $request->user()->id;
        $query = IdempotencyRecord::where('chapter_id', $chapterId)->where('id', $operationId);
        $record = $query->where('user_id', $userId)->first();
        if (! $record || ! $this->canReadAction($request, $record)) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Opening action not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $decoded = json_decode($record->response_body, true);

        return response()->json([
            'data' => [
                'operation_id' => $record->id,
                'action_key' => $record->key,
                'chapter_id' => $record->chapter_id,
                'operation_name' => $record->operation_name,
                'status' => $record->state ?? 'committed',
                'http_status' => $record->response_code,
                'result' => $decoded['data'] ?? $decoded ?? $record->response_body,
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    private function canReadAction(Request $request, IdempotencyRecord $record): bool
    {
        $required = match ($record->operation_name) {
            'createIpc', 'replaceIpc', 'submitIpc' => 'ipc.draft',
            'saveMyIpcCount' => 'ipc.count',
            'authorizeIpc' => 'ipc.authorize',
            'createOpeningRm', 'replaceOpeningRm', 'inspectOpeningRm', 'matchOpeningRmEvidence' => 'opening_rm.prepare',
            'postOpeningRm' => 'opening_rm.post',
            default => null,
        };

        return $required !== null && $request->attributes->get(ChapterAuthority::class)->allows($required);
    }

    private function recordOpeningHistory(
        string $recordType,
        string $recordId,
        string $chapterId,
        int $revision,
        int $materialVersion,
        string $eventType,
        ?string $actorUserId,
        array $snapshot
    ): void {
        OpeningRecordHistory::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapterId,
            'record_type' => $recordType,
            'record_id' => $recordId,
            'revision' => $revision,
            'material_version' => $materialVersion,
            'event_type' => $eventType,
            'actor_user_id' => $actorUserId,
            'snapshot_json' => $snapshot,
            'created_at' => now(),
        ]);
    }
}
