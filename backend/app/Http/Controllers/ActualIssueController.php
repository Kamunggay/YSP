<?php

namespace App\Http\Controllers;

use App\Models\ActualIssue;
use App\Models\ActualIssueLine;
use App\Models\Handover;
use App\Models\HandoverLine;
use App\Models\HandoverReceipt;
use App\Models\IdempotencyRecord;
use App\Models\IssueReconciliation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ActualIssueController extends Controller
{
    /**
     * POST /api/v1/chapters/{chapter_id}/internal-rfs/{rf_id}/actual-issues
     * Prepare draft actual issue with allocated lot coordinates.
     */
    public function prepare(Request $request, string $chapterId, string $rfId): JsonResponse
    {
        $userId = $request->header('X-User-Id') ?? session('user_id') ?? 'system-user';

        $data = $request->validate([
            'recipient_name' => 'nullable|string',
            'recipient_id' => 'nullable|string',
            'lines' => 'required|array|min:1',
            'lines.*.requisition_line_id' => 'nullable|string',
            'lines.*.source_line_id' => 'nullable|string',
            'lines.*.variant_id' => 'required|string',
            'lines.*.unit_id' => 'required|string',
            'lines.*.lot_id' => 'nullable|string',
            'lines.*.allocated_quantity' => 'nullable',
            'lines.*.issued_quantity' => 'nullable',
            'lines.*.actual_quantity' => 'nullable',
            'material_version' => 'nullable|integer',
        ]);

        $recipientName = $data['recipient_name'] ?? $data['recipient_id'] ?? 'Internal Recipient';

        return DB::transaction(function () use ($chapterId, $rfId, $userId, $data, $recipientName) {
            $issue = ActualIssue::create([
                'chapter_id' => $chapterId,
                'requisition_id' => $rfId,
                'issue_number' => 'IS-' . strtoupper(Str::random(8)),
                'status' => 'prepared',
                'recipient_name' => $recipientName,
                'prepared_by_user_id' => $userId,
                'actual_handover_at' => now(),
                'evidence_binding_id' => null,
                'material_version' => $data['material_version'] ?? 1,
            ]);

            foreach ($data['lines'] as $line) {
                $allocatedQty = (float) ($line['allocated_quantity'] ?? $line['actual_quantity'] ?? 0);
                $issuedQty = (float) ($line['issued_quantity'] ?? $line['actual_quantity'] ?? $allocatedQty);

                ActualIssueLine::create([
                    'actual_issue_id' => $issue->id,
                    'requisition_line_id' => $line['requisition_line_id'] ?? $line['source_line_id'] ?? (string) Str::uuid(),
                    'variant_id' => $line['variant_id'],
                    'unit_id' => $line['unit_id'],
                    'lot_id' => $line['lot_id'] ?? null,
                    'allocated_quantity' => $allocatedQty,
                    'issued_quantity' => $issuedQty,
                ]);
            }

            return response()->json([
                'data' => $issue->load('lines'),
            ], 201, ['Cache-Control' => 'no-store']);
        });
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/internal-rfs/{rf_id}/actual-issues
     */
    public function index(string $chapterId, string $rfId): JsonResponse
    {
        $issues = ActualIssue::with('lines')
            ->where('chapter_id', $chapterId)
            ->where('requisition_id', $rfId)
            ->latest()
            ->get();

        return response()->json(['data' => $issues], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}
     */
    public function show(string $chapterId, string $issueId): JsonResponse
    {
        $issue = ActualIssue::with(['lines', 'reconciliations'])
            ->where('chapter_id', $chapterId)
            ->where('id', $issueId)
            ->first();

        if (! $issue) {
            return response()->json([
                'error' => 'NOT_FOUND',
                'message' => 'Actual issue not found.',
            ], 404, ['Cache-Control' => 'no-store']);
        }

        return response()->json(['data' => $issue], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * PUT /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}
     */
    public function revise(Request $request, string $chapterId, string $issueId): JsonResponse
    {
        $issue = ActualIssue::where('chapter_id', $chapterId)->where('id', $issueId)->first();
        if (! $issue) {
            return response()->json(['error' => 'NOT_FOUND', 'message' => 'Actual issue not found.'], 404);
        }

        if ($issue->status === 'posted') {
            return response()->json(['error' => 'CONFLICT', 'message' => 'Cannot revise posted issue.'], 409);
        }

        $data = $request->validate([
            'recipient_name' => 'nullable|string',
            'lines' => 'nullable|array',
        ]);

        if (! empty($data['recipient_name'])) {
            $issue->recipient_name = $data['recipient_name'];
        }
        $issue->material_version += 1;
        $issue->save();

        if (! empty($data['lines'])) {
            $issue->lines()->delete();
            foreach ($data['lines'] as $line) {
                ActualIssueLine::create([
                    'actual_issue_id' => $issue->id,
                    'requisition_line_id' => $line['requisition_line_id'] ?? (string) Str::uuid(),
                    'variant_id' => $line['variant_id'],
                    'unit_id' => $line['unit_id'],
                    'lot_id' => $line['lot_id'] ?? null,
                    'allocated_quantity' => $line['allocated_quantity'] ?? 0,
                    'issued_quantity' => $line['issued_quantity'] ?? 0,
                ]);
            }
        }

        return response()->json(['data' => $issue->fresh('lines')], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/print
     */
    public function print(string $chapterId, string $issueId): JsonResponse
    {
        $issue = ActualIssue::with('lines')->where('chapter_id', $chapterId)->where('id', $issueId)->first();
        if (! $issue) {
            return response()->json(['error' => 'NOT_FOUND', 'message' => 'Actual issue not found.'], 404);
        }

        return response()->json([
            'data' => [
                'issue' => $issue,
                'voucher_type' => 'IS_AR',
                'voucher_number' => $issue->issue_number,
                'printed_at' => now()->toIso8601String(),
                'printable_html' => "<div class='is-ar-voucher'><h3>Issue Slip & Acknowledgment Receipt</h3><p>Issue: {$issue->issue_number}</p></div>",
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/acknowledgments
     */
    public function matchAcknowledgment(Request $request, string $chapterId, string $issueId): JsonResponse
    {
        $issue = ActualIssue::where('chapter_id', $chapterId)->where('id', $issueId)->first();
        if (! $issue) {
            return response()->json(['error' => 'NOT_FOUND', 'message' => 'Actual issue not found.'], 404);
        }

        $validated = $request->validate([
            'evidence_binding_id' => 'required|string',
        ]);

        $issue->evidence_binding_id = $validated['evidence_binding_id'];
        $issue->status = 'acknowledged';
        $issue->save();

        return response()->json(['data' => $issue], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/post
     */
    public function post(Request $request, string $chapterId, string $issueId): JsonResponse
    {
        $issue = ActualIssue::with('lines')->where('chapter_id', $chapterId)->where('id', $issueId)->first();
        if (! $issue) {
            return response()->json(['error' => 'NOT_FOUND', 'message' => 'Actual issue not found.'], 404);
        }

        if ($issue->status === 'posted') {
            return response()->json(['error' => 'CONFLICT', 'message' => 'Issue is already posted.'], 409);
        }

        return DB::transaction(function () use ($issue, $chapterId) {
            $issue->status = 'posted';
            $issue->actual_handover_at = now();
            $issue->save();

            // Create corresponding handover record
            $handover = Handover::create([
                'chapter_id' => $chapterId,
                'handover_reference' => 'HO-' . $issue->issue_number,
                'source_type' => 'REQUISITION',
                'source_id' => $issue->requisition_id,
                'recipient_name' => $issue->recipient_name,
                'actual_handover_at' => now(),
                'handover_officer_id' => $issue->prepared_by_user_id,
                'evidence_binding_id' => $issue->evidence_binding_id,
                'status' => 'COMMITTED',
            ]);

            foreach ($issue->lines as $line) {
                HandoverLine::create([
                    'handover_id' => $handover->id,
                    'source_line_id' => $line->requisition_line_id,
                    'variant_id' => $line->variant_id,
                    'unit_id' => $line->unit_id,
                    'actual_quantity' => $line->issued_quantity,
                    'inventory_movement_id' => (string) Str::uuid(),
                ]);
            }

            HandoverReceipt::create([
                'handover_id' => $handover->id,
                'receipt_type' => 'IS_AR',
                'receipt_number' => 'AR-' . strtoupper(Str::random(8)),
                'printed_at' => now(),
                'printed_by' => $issue->prepared_by_user_id,
            ]);

            return response()->json([
                'operation_id' => (string) Str::uuid(),
                'outcome' => 'committed',
                'actual_issue_id' => $issue->id,
                'handover_id' => $handover->id,
                'status' => 'posted',
            ], 200, ['Cache-Control' => 'no-store']);
        });
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/history
     */
    public function history(string $chapterId, string $issueId): JsonResponse
    {
        return response()->json(['data' => []], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/movements
     */
    public function movements(string $chapterId, string $issueId): JsonResponse
    {
        return response()->json(['data' => []], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/related
     */
    public function related(string $chapterId, string $issueId): JsonResponse
    {
        $issue = ActualIssue::where('chapter_id', $chapterId)->where('id', $issueId)->first();
        if (! $issue) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }

        $handover = Handover::where('chapter_id', $chapterId)
            ->where('source_type', 'REQUISITION')
            ->where('source_id', $issue->requisition_id)
            ->first();

        return response()->json([
            'data' => [
                'issue' => $issue,
                'handover' => $handover,
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/reconciliations
     */
    public function reconciliations(Request $request, string $chapterId, string $issueId): JsonResponse
    {
        $issue = ActualIssue::where('chapter_id', $chapterId)->where('id', $issueId)->first();
        if (! $issue) {
            return response()->json([
                'error' => 'NOT_FOUND',
                'message' => 'Actual issue not found.',
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $validated = $request->validate([
            'finding' => 'required|string|in:no_handover,handed_over_unposted,committed,disputed',
            'notes' => 'nullable|string',
            'officer_user_id' => 'nullable|string',
            'reconciled_at' => 'nullable',
        ]);

        $userId = $validated['officer_user_id']
            ?? $request->header('X-User-Id')
            ?? session('user_id')
            ?? 'reconciliation-officer';

        $reconciliation = IssueReconciliation::create([
            'chapter_id' => $chapterId,
            'actual_issue_id' => $issue->id,
            'officer_user_id' => $userId,
            'finding' => $validated['finding'],
            'notes' => $validated['notes'] ?? null,
            'reconciled_at' => $validated['reconciled_at'] ?? now(),
        ]);

        return response()->json([
            'data' => $reconciliation,
        ], 201, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/reconciliation
     */
    public function showReconciliation(string $chapterId, string $issueId): JsonResponse
    {
        $reconciliations = IssueReconciliation::where('chapter_id', $chapterId)
            ->where('actual_issue_id', $issueId)
            ->latest()
            ->get();

        return response()->json(['data' => $reconciliations], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issue-operations/by-key
     */
    public function operationsByKey(Request $request, string $chapterId): JsonResponse
    {
        $key = $request->query('key');
        if (! $key) {
            return response()->json(['error' => 'MISSING_KEY'], 400);
        }

        $record = IdempotencyRecord::where('key', $key)->where('chapter_id', $chapterId)->first();
        if (! $record) {
            return response()->json(['error' => 'OPERATION_NOT_FOUND'], 404);
        }

        $decoded = json_decode($record->response_body, true);
        return response()->json($decoded ?? $record->response_body, $record->response_code, [
            'X-Action-Replayed' => 'true',
            'Cache-Control' => 'no-store',
        ]);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issue-operations/{operation_id}
     */
    public function operationsById(string $chapterId, string $operationId): JsonResponse
    {
        $record = IdempotencyRecord::where('id', $operationId)->where('chapter_id', $chapterId)->first();
        if (! $record) {
            return response()->json(['error' => 'OPERATION_NOT_FOUND'], 404);
        }

        $decoded = json_decode($record->response_body, true);
        return response()->json($decoded ?? $record->response_body, $record->response_code, [
            'Cache-Control' => 'no-store',
        ]);
    }
}
