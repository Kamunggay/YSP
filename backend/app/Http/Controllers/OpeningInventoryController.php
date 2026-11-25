<?php

namespace App\Http\Controllers;

use App\Models\EvidenceBinding;
use App\Models\IdempotencyRecord;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\OpeningCount;
use App\Models\OpeningCountLine;
use App\Models\OpeningRecordHistory;
use App\Models\OpeningRm;
use App\Services\Authority\ChapterAuthority;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Inventory\Participants\PrepareOpeningInventoryParticipant;
use App\Services\Inventory\StockViewQueryService;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\CanonicalJson;
use App\Services\Shared\ReferenceSequenceService;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class OpeningInventoryController extends Controller
{
    public function __construct(
        protected PrepareOpeningInventoryParticipant $openingParticipant,
        protected StockViewQueryService $stockViewService,
        protected ?CheckEvidenceBindingParticipant $checkEvidenceBinding = null,
        protected ?ReferenceSequenceService $referenceSequences = null,
        protected ?DomainNotificationOutboxService $outbox = null
    ) {
        $this->checkEvidenceBinding = $checkEvidenceBinding ?? app(CheckEvidenceBindingParticipant::class);
        $this->referenceSequences = $referenceSequences ?? app(ReferenceSequenceService::class);
        $this->outbox = $outbox ?? app(DomainNotificationOutboxService::class);
    }

    // ==========================================
    // IPC ENDPOINTS
    // ==========================================

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs
     */
    public function listIpcs(Request $request, string $chapterId): JsonResponse
    {
        $ipcs = OpeningCount::where('chapter_id', $chapterId)
            ->with('lines')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'data' => $ipcs,
            'page' => [
                'has_more' => false,
                'next_cursor' => null,
                'total_elements' => $ipcs->count(),
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/ipcs
     */
    public function createIpc(Request $request, string $chapterId): JsonResponse
    {
        $userId = $request->user()->id;

        return DB::transaction(function () use ($chapterId, $userId, $request) {
            $ipc = OpeningCount::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $chapterId,
                'status' => 'DRAFT',
                'notes' => $request->input('notes'),
                'revision' => 1,
                'material_version' => 1,
                'created_by' => $userId,
            ]);

            $this->recordOpeningHistory('IPC', $ipc->id, $chapterId, 1, 1, 'created', $userId, $ipc->toArray());
            $this->outbox->recordIntent('stage1.ipc.changed.v1', $chapterId, $ipc->id, $ipc->revision, $ipc->material_version);

            return response()->json([
                'data' => $ipc->load('lines'),
            ], 201, ['Cache-Control' => 'no-store']);
        });
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}
     */
    public function readIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        $ipc = OpeningCount::where('chapter_id', $chapterId)
            ->where('id', $ipcId)
            ->with('lines')
            ->first();

        if (! $ipc) {
            return response()->json([
                'error' => 'IPC_NOT_FOUND',
                'message' => "IPC {$ipcId} was not found in chapter {$chapterId}.",
            ], 404, ['Cache-Control' => 'no-store']);
        }

        return response()->json([
            'data' => $ipc,
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * PUT /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/my-count
     */
    public function saveMyIpcCount(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        $ipc = OpeningCount::where('chapter_id', $chapterId)
            ->where('id', $ipcId)
            ->first();

        if (! $ipc) {
            return response()->json([
                'error' => 'IPC_NOT_FOUND',
                'message' => "IPC {$ipcId} was not found in chapter {$chapterId}.",
            ], 404, ['Cache-Control' => 'no-store']);
        }

        if ($ipc->status !== 'DRAFT') {
            return response()->json([
                'error' => 'INVALID_STATE',
                'message' => "Cannot modify count on IPC in status {$ipc->status}.",
            ], 409, ['Cache-Control' => 'no-store']);
        }

        $userId = $request->user()->id;
        $linesInput = $request->input('lines', []);

        return DB::transaction(function () use ($ipc, $chapterId, $userId, $linesInput) {
            OpeningCountLine::where('ipc_id', $ipc->id)
                ->where('counter_user_id', $userId)
                ->delete();

            foreach ($linesInput as $lineData) {
                OpeningCountLine::create([
                    'id' => (string) Str::uuid(),
                    'ipc_id' => $ipc->id,
                    'variant_id' => $lineData['variant_id'],
                    'unit_id' => $lineData['unit_id'],
                    'location_id' => $lineData['location_id'],
                    'lot_code' => $lineData['lot_code'] ?? 'DEFAULT',
                    'condition' => strtoupper($lineData['condition'] ?? 'USABLE'),
                    'counted_quantity' => (float) ($lineData['counted_quantity'] ?? $lineData['quantity'] ?? 0),
                    'counter_user_id' => $userId,
                ]);
            }

            $ipc->revision += 1;
            $ipc->save();

            $fresh = $ipc->fresh(['lines']);
            $this->recordOpeningHistory('IPC', $ipc->id, $chapterId, $ipc->revision, $ipc->material_version, 'count_saved', $userId, $fresh->toArray());
            $this->outbox->recordIntent('stage1.ipc.changed.v1', $chapterId, $ipc->id, $ipc->revision, $ipc->material_version);

            return response()->json([
                'data' => $fresh,
            ], 200, ['Cache-Control' => 'no-store']);
        });
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/submit
     */
    public function submitIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        $ipc = OpeningCount::where('chapter_id', $chapterId)
            ->where('id', $ipcId)
            ->with('lines')
            ->first();

        if (! $ipc) {
            return response()->json([
                'error' => 'IPC_NOT_FOUND',
                'message' => "IPC {$ipcId} was not found in chapter {$chapterId}.",
            ], 404, ['Cache-Control' => 'no-store']);
        }

        if ($ipc->status !== 'DRAFT') {
            return response()->json([
                'error' => 'INVALID_STATE',
                'message' => "Cannot submit IPC in status {$ipc->status}.",
            ], 409, ['Cache-Control' => 'no-store']);
        }

        if ($ipc->lines->isEmpty()) {
            return response()->json([
                'error' => 'EMPTY_COUNT',
                'message' => 'Cannot submit IPC with zero counted lines.',
            ], 422, ['Cache-Control' => 'no-store']);
        }

        $userId = $request->user()->id;

        return DB::transaction(function () use ($ipc, $chapterId, $userId) {
            if (! $ipc->ipc_number) {
                $seq = $this->referenceSequences->nextReference($chapterId, 'IPC');
                $ipc->ipc_number = $seq['reference'];
            }

            $ipc->status = 'AWAITING_AUTHORIZATION';
            $ipc->submitted_at = now();
            $ipc->revision += 1;
            $ipc->save();

            $fresh = $ipc->fresh(['lines']);
            $this->recordOpeningHistory('IPC', $ipc->id, $chapterId, $ipc->revision, $ipc->material_version, 'submitted', $userId, $fresh->toArray());
            $this->outbox->recordIntent('stage1.ipc.changed.v1', $chapterId, $ipc->id, $ipc->revision, $ipc->material_version);

            return response()->json([
                'data' => $fresh,
            ], 200, ['Cache-Control' => 'no-store']);
        });
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/authorizations
     * Enforces dual authorization & Segregation of Duties (GOV-05, GOV-06).
     */
    public function authorizeIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        $ipc = OpeningCount::where('chapter_id', $chapterId)
            ->where('id', $ipcId)
            ->first();

        if (! $ipc) {
            return response()->json([
                'error' => 'IPC_NOT_FOUND',
                'message' => "IPC {$ipcId} was not found in chapter {$chapterId}.",
            ], 404, ['Cache-Control' => 'no-store']);
        }

        if (! in_array($ipc->status, ['AWAITING_AUTHORIZATION', 'DRAFT'])) {
            return response()->json([
                'error' => 'INVALID_STATE',
                'message' => "IPC cannot be authorized in status {$ipc->status}.",
            ], 409, ['Cache-Control' => 'no-store']);
        }

        $userId = $request->user()->id;
        $role = strtoupper((string) $request->input('role', $request->input('duty_code', $request->input('slot', ''))));

        $headUser = $request->input('authorized_head_by');
        $financeUser = $request->input('authorized_finance_by');

        if ($headUser && $financeUser && $headUser === $financeUser) {
            return response()->json([
                'error' => 'SEGREGATION_OF_DUTIES_VIOLATION',
                'message' => 'Chapter Head and Finance authorizations must be performed by distinct individuals (GOV-05, GOV-06).',
            ], 422, ['Cache-Control' => 'no-store']);
        }

        if ($role === 'HEAD' || str_contains($role, 'HEAD')) {
            if ($ipc->authorized_finance_by && $ipc->authorized_finance_by === $userId) {
                return response()->json([
                    'error' => 'SEGREGATION_OF_DUTIES_VIOLATION',
                    'message' => 'Chapter Head and Finance authorizations must be performed by distinct individuals (GOV-05, GOV-06).',
                ], 422, ['Cache-Control' => 'no-store']);
            }
            $ipc->authorized_head_by = $userId;
            $ipc->authorized_head_signature = $request->input('signature', 'SIG-HEAD-'.$userId);
        } elseif ($role === 'FINANCE' || str_contains($role, 'FINANCE')) {
            if ($ipc->authorized_head_by && $ipc->authorized_head_by === $userId) {
                return response()->json([
                    'error' => 'SEGREGATION_OF_DUTIES_VIOLATION',
                    'message' => 'Chapter Head and Finance authorizations must be performed by distinct individuals (GOV-05, GOV-06).',
                ], 422, ['Cache-Control' => 'no-store']);
            }
            $ipc->authorized_finance_by = $userId;
            $ipc->authorized_finance_signature = $request->input('signature', 'SIG-FINANCE-'.$userId);
        } else {
            if (! $ipc->authorized_head_by) {
                $ipc->authorized_head_by = $userId;
                $ipc->authorized_head_signature = 'SIG-HEAD-'.$userId;
            } else {
                if ($ipc->authorized_head_by === $userId) {
                    return response()->json([
                        'error' => 'SEGREGATION_OF_DUTIES_VIOLATION',
                        'message' => 'Chapter Head and Finance authorizations must be performed by distinct individuals (GOV-05, GOV-06).',
                    ], 422, ['Cache-Control' => 'no-store']);
                }
                $ipc->authorized_finance_by = $userId;
                $ipc->authorized_finance_signature = 'SIG-FINANCE-'.$userId;
            }
        }

        return DB::transaction(function () use ($ipc, $chapterId, $userId) {
            if ($ipc->authorized_head_by && $ipc->authorized_finance_by) {
                $ipc->status = 'AUTHORIZED';
                $ipc->authorized_at = now();
            }

            $ipc->revision += 1;
            $ipc->save();

            $this->recordOpeningHistory('IPC', $ipc->id, $chapterId, $ipc->revision, $ipc->material_version, 'authorized', $userId, $ipc->toArray());
            $this->outbox->recordIntent('stage1.ipc.changed.v1', $chapterId, $ipc->id, $ipc->revision, $ipc->material_version);

            return response()->json([
                'data' => $ipc,
            ], 200, ['Cache-Control' => 'no-store']);
        });
    }

    /**
     * PUT /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}
     */
    public function replaceIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        $ipc = OpeningCount::where('chapter_id', $chapterId)->where('id', $ipcId)->first();
        if (! $ipc) {
            return response()->json(['error' => 'NOT_FOUND'], 404, ['Cache-Control' => 'no-store']);
        }

        $userId = $request->user()->id;

        return DB::transaction(function () use ($ipc, $request, $chapterId, $userId) {
            $ipc->notes = $request->input('notes', $ipc->notes);
            $ipc->revision += 1;
            $ipc->material_version += 1;
            $ipc->status = 'DRAFT';
            $ipc->save();

            $this->recordOpeningHistory('IPC', $ipc->id, $chapterId, $ipc->revision, $ipc->material_version, 'replaced', $userId, $ipc->toArray());
            $this->outbox->recordIntent('stage1.ipc.changed.v1', $chapterId, $ipc->id, $ipc->revision, $ipc->material_version);

            return response()->json(['data' => $ipc], 200, ['Cache-Control' => 'no-store']);
        });
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/history
     */
    public function listIpcHistory(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        $ipc = OpeningCount::where('chapter_id', $chapterId)->where('id', $ipcId)->first();
        if (! $ipc) {
            return response()->json(['error' => 'NOT_FOUND'], 404, ['Cache-Control' => 'no-store']);
        }

        $history = OpeningRecordHistory::where('chapter_id', $chapterId)
            ->where('record_type', 'IPC')
            ->where('record_id', $ipcId)
            ->orderBy('revision')
            ->get();

        if ($history->isEmpty()) {
            return response()->json(['data' => [$ipc]], 200, ['Cache-Control' => 'no-store']);
        }

        return response()->json(['data' => $history], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/versions/{revision}
     */
    public function readIpcRevision(Request $request, string $chapterId, string $ipcId, string $revision): JsonResponse
    {
        $ipc = OpeningCount::where('chapter_id', $chapterId)->where('id', $ipcId)->first();
        if (! $ipc) {
            return response()->json(['error' => 'NOT_FOUND'], 404, ['Cache-Control' => 'no-store']);
        }

        $revInt = (int) $revision;
        $record = OpeningRecordHistory::where('chapter_id', $chapterId)
            ->where('record_type', 'IPC')
            ->where('record_id', $ipcId)
            ->where('revision', $revInt)
            ->first();

        if (! $record) {
            if ($revInt === (int) $ipc->revision && OpeningRecordHistory::where('record_type', 'IPC')->where('record_id', $ipcId)->doesntExist()) {
                return response()->json(['data' => $ipc], 200, ['Cache-Control' => 'no-store']);
            }

            return response()->json(['error' => 'REVISION_NOT_FOUND', 'message' => "IPC revision {$revision} not found."], 404, ['Cache-Control' => 'no-store']);
        }

        return response()->json(['data' => $record->snapshot_json], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/related
     */
    public function readIpcRelated(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        $ipc = OpeningCount::where('chapter_id', $chapterId)->where('id', $ipcId)->first();
        if (! $ipc) {
            return response()->json(['error' => 'NOT_FOUND'], 404, ['Cache-Control' => 'no-store']);
        }

        $rms = OpeningRm::where('chapter_id', $chapterId)->where('ipc_id', $ipcId)->get();

        return response()->json(['data' => ['rms' => $rms]], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/print
     */
    public function printIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        $ipc = OpeningCount::where('chapter_id', $chapterId)->where('id', $ipcId)->with('lines')->first();
        if (! $ipc) {
            return response()->json(['error' => 'NOT_FOUND'], 404, ['Cache-Control' => 'no-store']);
        }

        $escapedNumber = e($ipc->ipc_number ?? 'UNSUBMITTED');
        $escapedStatus = e($ipc->status);
        $escapedNotes = e($ipc->notes ?? '');

        return response()->json([
            'data' => [
                'ipc' => $ipc,
                'printable_html' => "<div><h3>Inventory Physical Count</h3><p>IPC: {$escapedNumber}</p><p>Status: {$escapedStatus}</p><p>{$escapedNotes}</p></div>",
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    // ==========================================
    // OPENING RM ENDPOINTS
    // ==========================================

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms
     */
    public function listOpeningRms(Request $request, string $chapterId): JsonResponse
    {
        $rms = OpeningRm::where('chapter_id', $chapterId)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'data' => $rms,
            'page' => [
                'has_more' => false,
                'next_cursor' => null,
                'total_elements' => $rms->count(),
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/opening-rms
     */
    public function createOpeningRm(Request $request, string $chapterId): JsonResponse
    {
        $existingPosted = OpeningRm::where('chapter_id', $chapterId)->where('status', 'POSTED')->first();
        if ($existingPosted) {
            return response()->json([
                'error' => 'BASELINE_ALREADY_POSTED',
                'message' => 'An opening baseline has already been posted for chapter (RCV-10, T-18, A-18).',
            ], 409, ['Cache-Control' => 'no-store']);
        }

        $existingRm = OpeningRm::where('chapter_id', $chapterId)->first();
        if ($existingRm) {
            return response()->json([
                'data' => $existingRm,
            ], 200, ['Cache-Control' => 'no-store']);
        }

        $ipcId = $request->input('ipc_id');
        $ipc = OpeningCount::where('chapter_id', $chapterId)->where('id', $ipcId)->first();
        if (! $ipc) {
            return response()->json([
                'error' => 'IPC_NOT_FOUND',
                'message' => "IPC {$ipcId} was not found in chapter {$chapterId}.",
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $userId = $request->user()->id;

        return DB::transaction(function () use ($chapterId, $ipc, $request, $userId) {
            $rm = OpeningRm::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $chapterId,
                'ipc_id' => $ipc->id,
                'status' => 'DRAFT',
                'notes' => $request->input('notes'),
                'revision' => 1,
                'material_version' => 1,
            ]);

            $this->recordOpeningHistory('OPENING_RM', $rm->id, $chapterId, 1, 1, 'created', $userId, $rm->toArray());
            $this->outbox->recordIntent('stage1.opening-rm.changed.v1', $chapterId, $rm->id, $rm->revision, $rm->material_version);

            return response()->json([
                'data' => $rm,
            ], 201, ['Cache-Control' => 'no-store']);
        });
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}
     */
    public function readOpeningRm(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        $rm = OpeningRm::where('chapter_id', $chapterId)
            ->where('id', $rmId)
            ->first();

        if (! $rm) {
            return response()->json([
                'error' => 'OPENING_RM_NOT_FOUND',
                'message' => "Opening RM {$rmId} was not found.",
            ], 404, ['Cache-Control' => 'no-store']);
        }

        return response()->json([
            'data' => $rm,
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/inspection
     */
    public function inspectOpeningRm(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        $rm = OpeningRm::where('chapter_id', $chapterId)
            ->where('id', $rmId)
            ->first();

        if (! $rm) {
            return response()->json([
                'error' => 'OPENING_RM_NOT_FOUND',
                'message' => "Opening RM {$rmId} was not found.",
            ], 404, ['Cache-Control' => 'no-store']);
        }

        if ($rm->status !== 'DRAFT') {
            return response()->json([
                'error' => 'INVALID_STATE',
                'message' => "Cannot inspect RM in status {$rm->status}.",
            ], 409, ['Cache-Control' => 'no-store']);
        }

        $userId = $request->user()->id;
        $lines = $request->input('lines', []);

        return DB::transaction(function () use ($rm, $chapterId, $userId, $lines, $request) {
            $rm->status = 'INSPECTED';
            $rm->inspector_user_id = $userId;
            $rm->lines_data = $lines;
            $rm->inspection_data = [
                'inspector_id' => $userId,
                'inspected_at' => now()->toIso8601String(),
                'notes' => $request->input('inspection_notes', 'All counted lines inspected.'),
            ];
            $rm->revision += 1;
            $rm->save();

            $this->recordOpeningHistory('OPENING_RM', $rm->id, $chapterId, $rm->revision, $rm->material_version, 'inspected', $userId, $rm->toArray());
            $this->outbox->recordIntent('stage1.opening-rm.changed.v1', $chapterId, $rm->id, $rm->revision, $rm->material_version);

            return response()->json([
                'data' => $rm,
            ], 200, ['Cache-Control' => 'no-store']);
        });
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/evidence-match
     */
    public function matchOpeningRmEvidence(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        $rm = OpeningRm::where('chapter_id', $chapterId)
            ->where('id', $rmId)
            ->first();

        if (! $rm) {
            return response()->json([
                'error' => 'OPENING_RM_NOT_FOUND',
                'message' => "Opening RM {$rmId} was not found.",
            ], 404, ['Cache-Control' => 'no-store']);
        }

        if ($rm->status !== 'INSPECTED') {
            return response()->json([
                'error' => 'INVALID_STATE',
                'message' => "RM must be INSPECTED before evidence matching (current: {$rm->status}).",
            ], 409, ['Cache-Control' => 'no-store']);
        }

        $userId = $request->user()->id;
        $evidenceId = $request->input('evidence_id') ?? $request->input('evidence.evidence_id');
        $bindingId = $request->input('evidence_binding_id') ?? $request->input('acknowledgment_id');

        $existingBinding = $bindingId
            ? EvidenceBinding::where('id', $bindingId)->where('chapter_id', $chapterId)->first()
            : null;

        if ($evidenceId || $existingBinding) {
            try {
                $checkLines = [];
                foreach ((array) ($rm->lines_data ?? []) as $line) {
                    $checkLines[] = [
                        'variant_id' => $line['variant_id'] ?? '',
                        'unit_id' => $line['unit_id'] ?? '',
                        'quantity' => $line['accepted_quantity'] ?? $line['quantity'] ?? 0,
                    ];
                }

                $check = $this->checkEvidenceBinding->check([
                    'chapter_id' => $chapterId,
                    'evidence_id' => $evidenceId,
                    'binding_id' => $bindingId,
                    'source_type' => $existingBinding?->source_type ?? 'opening_receipt',
                    'source_id' => $existingBinding?->source_id ?? $rm->id,
                    'recipient_name' => $request->input('recipient_name', $existingBinding?->recipient_name ?? $rm->inspector_user_id ?? $userId),
                    'lines' => $checkLines,
                ], strict: true);

                $bindingId = $check['acknowledgment_id'] ?? $bindingId;
            } catch (DomainException $e) {
                return response()->json([
                    'error' => 'EVIDENCE_MISMATCH',
                    'code' => 'evidence_mismatch',
                    'message' => $e->getMessage(),
                ], 409, ['Cache-Control' => 'no-store']);
            }
        } elseif (! $bindingId) {
            $bindingId = (string) Str::uuid();
        }

        return DB::transaction(function () use ($rm, $chapterId, $bindingId, $userId) {
            $rm->status = 'EVIDENCE_MATCHED';
            $rm->evidence_binding_id = $bindingId;
            $rm->revision += 1;
            $rm->save();

            $this->recordOpeningHistory('OPENING_RM', $rm->id, $chapterId, $rm->revision, $rm->material_version, 'evidence_matched', $userId, $rm->toArray());
            $this->outbox->recordIntent('stage1.opening-rm.changed.v1', $chapterId, $rm->id, $rm->revision, $rm->material_version);

            return response()->json([
                'data' => $rm,
            ], 200, ['Cache-Control' => 'no-store']);
        });
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
        $rm = OpeningRm::where('chapter_id', $chapterId)->where('id', $rmId)->first();
        if (! $rm) {
            return response()->json(['error' => 'NOT_FOUND'], 404, ['Cache-Control' => 'no-store']);
        }

        $userId = $request->user()->id;

        return DB::transaction(function () use ($rm, $request, $chapterId, $userId) {
            $rm->notes = $request->input('notes', $rm->notes);
            $rm->revision += 1;
            $rm->material_version += 1;
            $rm->status = 'DRAFT';
            $rm->save();

            $this->recordOpeningHistory('OPENING_RM', $rm->id, $chapterId, $rm->revision, $rm->material_version, 'replaced', $userId, $rm->toArray());
            $this->outbox->recordIntent('stage1.opening-rm.changed.v1', $chapterId, $rm->id, $rm->revision, $rm->material_version);

            return response()->json(['data' => $rm], 200, ['Cache-Control' => 'no-store']);
        });
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/history
     */
    public function listOpeningRmHistory(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        $rm = OpeningRm::where('chapter_id', $chapterId)->where('id', $rmId)->first();
        if (! $rm) {
            return response()->json(['error' => 'NOT_FOUND'], 404, ['Cache-Control' => 'no-store']);
        }

        $history = OpeningRecordHistory::where('chapter_id', $chapterId)
            ->where('record_type', 'OPENING_RM')
            ->where('record_id', $rmId)
            ->orderBy('revision')
            ->get();

        if ($history->isEmpty()) {
            return response()->json(['data' => [$rm]], 200, ['Cache-Control' => 'no-store']);
        }

        return response()->json(['data' => $history], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/versions/{revision}
     */
    public function readOpeningRmRevision(Request $request, string $chapterId, string $rmId, string $revision): JsonResponse
    {
        $rm = OpeningRm::where('chapter_id', $chapterId)->where('id', $rmId)->first();
        if (! $rm) {
            return response()->json(['error' => 'NOT_FOUND'], 404, ['Cache-Control' => 'no-store']);
        }

        $revInt = (int) $revision;
        $record = OpeningRecordHistory::where('chapter_id', $chapterId)
            ->where('record_type', 'OPENING_RM')
            ->where('record_id', $rmId)
            ->where('revision', $revInt)
            ->first();

        if (! $record) {
            if ($revInt === (int) $rm->revision && OpeningRecordHistory::where('record_type', 'OPENING_RM')->where('record_id', $rmId)->doesntExist()) {
                return response()->json(['data' => $rm], 200, ['Cache-Control' => 'no-store']);
            }

            return response()->json(['error' => 'REVISION_NOT_FOUND', 'message' => "Opening RM revision {$revision} not found."], 404, ['Cache-Control' => 'no-store']);
        }

        return response()->json(['data' => $record->snapshot_json], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/related
     */
    public function readOpeningRmRelated(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        $rm = OpeningRm::where('chapter_id', $chapterId)->where('id', $rmId)->first();
        if (! $rm) {
            return response()->json(['error' => 'NOT_FOUND'], 404, ['Cache-Control' => 'no-store']);
        }

        return response()->json(['data' => ['ipc_id' => $rm->ipc_id]], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/print
     */
    public function printOpeningRm(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        $rm = OpeningRm::where('chapter_id', $chapterId)->where('id', $rmId)->first();
        if (! $rm) {
            return response()->json(['error' => 'NOT_FOUND'], 404, ['Cache-Control' => 'no-store']);
        }

        $escapedNumber = e($rm->rm_number ?? 'UNPOSTED');
        $escapedStatus = e($rm->status);
        $escapedNotes = e($rm->notes ?? '');

        return response()->json([
            'data' => [
                'rm' => $rm,
                'printable_html' => "<div><h3>Opening Receiving Manifest</h3><p>RM: {$escapedNumber}</p><p>Status: {$escapedStatus}</p><p>{$escapedNotes}</p></div>",
            ],
        ], 200, ['Cache-Control' => 'no-store']);
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
