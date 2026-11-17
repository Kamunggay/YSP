<?php

namespace App\Http\Controllers;

use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\OpeningCount;
use App\Models\OpeningCountLine;
use App\Models\OpeningRm;
use App\Services\Inventory\Participants\PrepareOpeningInventoryParticipant;
use App\Services\Inventory\StockViewQueryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class OpeningInventoryController extends Controller
{
    public function __construct(
        protected PrepareOpeningInventoryParticipant $openingParticipant,
        protected StockViewQueryService $stockViewService
    ) {}

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
        $userId = $request->header('X-User-Id') ?? session('user_id') ?? 'system-user';

        $ipc = OpeningCount::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapterId,
            'status' => 'DRAFT',
            'notes' => $request->input('notes'),
            'revision' => 1,
            'material_version' => 1,
            'created_by' => $userId,
        ]);

        return response()->json([
            'data' => $ipc->load('lines'),
        ], 201, ['Cache-Control' => 'no-store']);
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

        $userId = $request->header('X-User-Id') ?? session('user_id') ?? 'counter-user';
        $linesInput = $request->input('lines', []);

        return DB::transaction(function () use ($ipc, $userId, $linesInput) {
            // Delete existing lines for this counter on this IPC
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

            return response()->json([
                'data' => $ipc->fresh(['lines']),
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

        $ipc->status = 'AWAITING_AUTHORIZATION';
        $ipc->submitted_at = now();
        $ipc->ipc_number = $ipc->ipc_number ?? 'IPC-'.date('Ymd').'-'.strtoupper(substr($ipc->id, 0, 6));
        $ipc->revision += 1;
        $ipc->save();

        return response()->json([
            'data' => $ipc,
        ], 200, ['Cache-Control' => 'no-store']);
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

        $userId = $request->header('X-User-Id') ?? session('user_id') ?? 'authorizer-user';
        $role = strtoupper($request->input('role', $request->input('duty_code', $request->input('slot', ''))));

        // If direct dual payload provided
        $headUser = $request->input('authorized_head_by');
        $financeUser = $request->input('authorized_finance_by');

        if ($headUser && $financeUser && $headUser === $financeUser) {
            return response()->json([
                'error' => 'SEGREGATION_OF_DUTIES_VIOLATION',
                'message' => 'Chapter Head and Finance authorizations must be performed by distinct individuals (GOV-05, GOV-06).',
            ], 422, ['Cache-Control' => 'no-store']);
        }

        // Determine which slot is being authorized
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
            // If role not explicitly specified, fill head first, then finance
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

        // If both slots filled, transition to AUTHORIZED
        if ($ipc->authorized_head_by && $ipc->authorized_finance_by) {
            $ipc->status = 'AUTHORIZED';
            $ipc->authorized_at = now();
        }

        $ipc->revision += 1;
        $ipc->save();

        return response()->json([
            'data' => $ipc,
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * PUT /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}
     */
    public function replaceIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        $ipc = OpeningCount::where('chapter_id', $chapterId)->where('id', $ipcId)->first();
        if (! $ipc) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        $ipc->notes = $request->input('notes', $ipc->notes);
        $ipc->revision += 1;
        $ipc->material_version += 1;
        $ipc->status = 'DRAFT';
        $ipc->save();

        return response()->json(['data' => $ipc], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/history
     */
    public function listIpcHistory(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        $ipc = OpeningCount::where('chapter_id', $chapterId)->where('id', $ipcId)->first();
        if (! $ipc) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        return response()->json(['data' => [$ipc]], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/versions/{revision}
     */
    public function readIpcRevision(Request $request, string $chapterId, string $ipcId, string $revision): JsonResponse
    {
        $ipc = OpeningCount::where('chapter_id', $chapterId)->where('id', $ipcId)->first();
        if (! $ipc) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        return response()->json(['data' => $ipc], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/related
     */
    public function readIpcRelated(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        $ipc = OpeningCount::where('chapter_id', $chapterId)->where('id', $ipcId)->first();
        if (! $ipc) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        $rms = OpeningRm::where('ipc_id', $ipcId)->get();

        return response()->json(['data' => ['rms' => $rms]], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/ipcs/{ipc_id}/print
     */
    public function printIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        $ipc = OpeningCount::where('chapter_id', $chapterId)->where('id', $ipcId)->with('lines')->first();
        if (! $ipc) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        return response()->json([
            'data' => [
                'ipc' => $ipc,
                'printable_html' => "<div><h3>Inventory Physical Count</h3><p>IPC: {$ipc->ipc_number}</p></div>",
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
        // Enforce chapter singleton baseline fence
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

        $rm = OpeningRm::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapterId,
            'ipc_id' => $ipc->id,
            'status' => 'DRAFT',
            'notes' => $request->input('notes'),
            'revision' => 1,
            'material_version' => 1,
        ]);

        return response()->json([
            'data' => $rm,
        ], 201, ['Cache-Control' => 'no-store']);
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

        $userId = $request->header('X-User-Id') ?? session('user_id') ?? 'inspector-user';
        $lines = $request->input('lines', []);

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

        return response()->json([
            'data' => $rm,
        ], 200, ['Cache-Control' => 'no-store']);
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

        $bindingId = $request->input('evidence_binding_id', $request->input('acknowledgment_id', (string) Str::uuid()));

        $rm->status = 'EVIDENCE_MATCHED';
        $rm->evidence_binding_id = $bindingId;
        $rm->revision += 1;
        $rm->save();

        return response()->json([
            'data' => $rm,
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/post
     * Atomic commit of opening baseline movements & singleton fence (RCV-10, T-18, A-18).
     */
    public function postOpeningRm(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        // Concurrency & Chapter Singleton Fence Check
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

        $userId = $request->header('X-User-Id') ?? session('user_id') ?? 'posting-officer';

        return DB::transaction(function () use ($chapterId, $rm, $userId) {
            // Locking recheck inside transaction
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

            // Commit physical stock movements via participant
            $posting = $this->openingParticipant->execute(
                chapterId: $chapterId,
                openingRm: $rm,
                actorId: $userId
            );

            $rmNumber = $rm->rm_number ?? 'CEB-RM-'.date('Ymd').'-'.strtoupper(substr($rm->id, 0, 6));

            $rm->status = 'POSTED';
            $rm->rm_number = $rmNumber;
            $rm->posted_at = now();
            $rm->revision += 1;
            $rm->save();

            // Link IPC status
            $ipc = $rm->ipc;
            if ($ipc) {
                $ipc->status = 'POSTED';
                $ipc->save();
            }

            return response()->json([
                'data' => [
                    'record' => $rm,
                    'posting' => $posting,
                ],
            ], 200, ['Cache-Control' => 'no-store']);
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
            return response()->json(['error' => 'NOT_FOUND'], 404);
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
            return response()->json(['error' => 'NOT_FOUND'], 404);
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
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        $rm->notes = $request->input('notes', $rm->notes);
        $rm->revision += 1;
        $rm->material_version += 1;
        $rm->status = 'DRAFT';
        $rm->save();

        return response()->json(['data' => $rm], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/history
     */
    public function listOpeningRmHistory(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        $rm = OpeningRm::where('chapter_id', $chapterId)->where('id', $rmId)->first();
        if (! $rm) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        return response()->json(['data' => [$rm]], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/versions/{revision}
     */
    public function readOpeningRmRevision(Request $request, string $chapterId, string $rmId, string $revision): JsonResponse
    {
        $rm = OpeningRm::where('chapter_id', $chapterId)->where('id', $rmId)->first();
        if (! $rm) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        return response()->json(['data' => $rm], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-rms/{rm_id}/related
     */
    public function readOpeningRmRelated(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        $rm = OpeningRm::where('chapter_id', $chapterId)->where('id', $rmId)->first();
        if (! $rm) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
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
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        return response()->json([
            'data' => [
                'rm' => $rm,
                'printable_html' => "<div><h3>Opening Receiving Manifest</h3><p>RM: {$rm->rm_number}</p></div>",
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-actions/by-key
     */
    public function findOpeningActionByKey(Request $request, string $chapterId): JsonResponse
    {
        $key = $request->header('X-Action-Key') ?? $request->query('action_key');

        return response()->json([
            'data' => [
                'action_key' => $key,
                'chapter_id' => $chapterId,
                'status' => 'completed',
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/opening-actions/{operation_id}
     */
    public function readOpeningAction(Request $request, string $chapterId, string $operationId): JsonResponse
    {
        return response()->json([
            'data' => [
                'operation_id' => $operationId,
                'chapter_id' => $chapterId,
                'status' => 'completed',
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }
}
