<?php

namespace App\Http\Controllers;

use App\Models\Handover;
use App\Models\IdempotencyRecord;
use App\Services\Delivery\HandoverCoordinatorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class HandoverController extends Controller
{
    /**
     * POST /api/v1/handovers
     * Record an actual handover dispatched to the owning source domain transaction.
     */
    public function store(Request $request, HandoverCoordinatorService $coordinator): JsonResponse
    {
        $idempotencyKey = $request->header('Idempotency-Key')
            ?? $request->header('X-Action-Key')
            ?? $request->header('X-Idempotency-Key');

        $chapterId = $request->route('chapter_id')
            ?? $request->header('X-Chapter-Id')
            ?? $request->input('chapter_id');

        $userId = $request->header('X-User-Id')
            ?? session('user_id')
            ?? 'system-user';

        $validated = $request->validate([
            'source.kind' => 'required|string',
            'source.id' => 'required|string',
            'source.expected_version' => 'nullable|integer',
            'lines' => 'required|array|min:1',
            'lines.*.source_line_id' => 'nullable|string',
            'lines.*.variant_id' => 'nullable|string',
            'lines.*.unit_id' => 'nullable|string',
            'lines.*.actual_quantity' => 'nullable',
            'lines.*.quantity' => 'nullable',
            'recipient_name' => 'required|string',
            'actual_handover_at' => 'nullable',
            'evidence_id' => 'nullable|string',
            'acknowledgment_binding_id' => 'nullable|string',
        ]);

        try {
            $result = $coordinator->coordinateHandover(
                $validated,
                $idempotencyKey,
                $chapterId,
                $userId,
                $request->getContent()
            );

            $headers = [
                'Cache-Control' => 'no-store',
            ];
            if (! empty($result['replayed'])) {
                $headers['X-Action-Replayed'] = 'true';
            }

            return response()->json($result['body'], $result['status'], $headers);
        } catch (HttpException $e) {
            return response()->json([
                'error' => 'IDEMPOTENCY_CONFLICT',
                'code' => 'action_key_conflict',
                'message' => $e->getMessage(),
            ], $e->getStatusCode(), [
                'Cache-Control' => 'no-store',
            ]);
        } catch (\DomainException $e) {
            return response()->json([
                'error' => 'EVIDENCE_MISMATCH',
                'code' => 'evidence_binding_invalid',
                'message' => $e->getMessage(),
            ], 422, [
                'Cache-Control' => 'no-store',
            ]);
        }
    }

    /**
     * GET /api/v1/operations/by-idempotency-key/{key}
     * Retrieve the authorized result for an idempotency key within chapter scope.
     */
    public function showByIdempotencyKey(Request $request, string $key): JsonResponse
    {
        $chapterId = $request->route('chapter_id')
            ?? $request->header('X-Chapter-Id')
            ?? $request->query('chapter_id');

        $query = IdempotencyRecord::where('key', $key);

        $record = $query->first();

        if (! $record) {
            return response()->json([
                'error' => 'OPERATION_NOT_FOUND',
                'message' => 'No operation found for the provided idempotency key.',
            ], 404, ['Cache-Control' => 'no-store']);
        }

        // Enforce chapter isolation
        if ($chapterId && $record->chapter_id && $record->chapter_id !== $chapterId) {
            return response()->json([
                'error' => 'OPERATION_NOT_FOUND',
                'message' => 'No operation found for the provided idempotency key.',
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $decoded = json_decode($record->response_body, true);
        $content = $decoded !== null ? $decoded : $record->response_body;

        return response()->json($content, $record->response_code, [
            'X-Action-Replayed' => 'true',
            'Cache-Control' => 'no-store',
        ]);
    }

    /**
     * GET /api/v1/handovers
     * List handovers optionally filtered by chapter.
     */
    public function index(Request $request): JsonResponse
    {
        $chapterId = $request->route('chapter_id')
            ?? $request->header('X-Chapter-Id')
            ?? $request->query('chapter_id');

        $query = Handover::with(['lines', 'receipts']);
        if ($chapterId) {
            $query->where('chapter_id', $chapterId);
        }

        return response()->json([
            'data' => $query->latest()->get(),
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/handovers/{id}
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $chapterId = $request->route('chapter_id')
            ?? $request->header('X-Chapter-Id')
            ?? $request->query('chapter_id');

        $query = Handover::with(['lines', 'receipts'])->where('id', $id);
        if ($chapterId) {
            $query->where('chapter_id', $chapterId);
        }

        $handover = $query->first();
        if (! $handover) {
            return response()->json([
                'error' => 'HANDOVER_NOT_FOUND',
                'message' => 'Handover not found.',
            ], 404, ['Cache-Control' => 'no-store']);
        }

        return response()->json([
            'data' => $handover,
        ], 200, ['Cache-Control' => 'no-store']);
    }
}
