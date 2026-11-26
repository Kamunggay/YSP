<?php

namespace App\Http\Middleware;

use App\Exceptions\ContractException;
use App\Http\Controllers\ActualIssueController;
use App\Models\Chapter;
use App\Models\IdempotencyRecord;
use App\Models\InternalRf;
use App\Models\StockReservation;
use App\Services\Authority\ChapterAuthority;
use App\Services\Shared\CanonicalJson;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class IdempotentOperation
{
    public function handle(Request $request, Closure $next): Response
    {
        $idempotencyKey = $request->header('Idempotency-Key')
            ?? $request->header('X-Action-Key')
            ?? $request->header('X-Idempotency-Key');

        if (! $idempotencyKey || ! in_array($request->method(), ['POST', 'PUT', 'PATCH', 'DELETE'])) {
            return $next($request);
        }

        $chapterParam = $request->route('chapter_id') ?? $request->header('X-Chapter-Id');
        $chapterAttr = $request->attributes->get('chapter');
        if ($chapterAttr instanceof Chapter) {
            $chapterId = $chapterAttr->id;
        } elseif ($chapterParam) {
            $resolved = Chapter::where('id', $chapterParam)->orWhere('code', $chapterParam)->first();
            $chapterId = $resolved ? $resolved->id : $chapterParam;
        } else {
            $chapterId = null;
        }

        $userId = $request->user()?->id ?? $request->header('X-User-Id') ?? session('user_id');
        $rawContent = $request->getContent();
        $decodedBody = $rawContent !== '' ? json_decode($rawContent, true) : null;
        $payloadHash = (json_last_error() === JSON_ERROR_NONE && is_array($decodedBody))
            ? CanonicalJson::sha256($decodedBody)
            : hash('sha256', $rawContent);

        $stageOne = $request->attributes->has(ChapterAuthority::class);
        $operationName = $request->route()?->getActionMethod();
        if ($request->route()?->getControllerClass() === ActualIssueController::class) {
            $operationName = match ($operationName) {
                'prepare' => 'prepareActualIssue',
                'revise' => 'reviseActualIssue',
                'matchAcknowledgment' => 'matchActualIssueAcknowledgment',
                'post' => 'postActualIssue',
                'reconciliations' => 'recordIssueReconciliation',
                default => $operationName,
            };
        }

        $lookup = IdempotencyRecord::where('key', $idempotencyKey);
        if ($stageOne) {
            $lookup->where('chapter_id', $chapterId)->where('user_id', $userId)->where('operation_name', $operationName);
        }
        $existing = $lookup->first();
        $targetId = $stageOne ? collect($request->route()->parameters())->except('chapter_id')->last() : null;

        if ($existing) {
            if (
                $existing->chapter_id !== $chapterId
                || $existing->user_id !== $userId
                || $existing->payload_hash !== $payloadHash
            ) {
                if ($stageOne) {
                    throw new ContractException(409, 'action_key_conflict', 'Use a new action key for changed input.');
                }

                return response()->json([
                    'error' => 'IDEMPOTENCY_CONFLICT',
                    'code' => 'action_key_conflict',
                    'message' => 'An operation with this idempotency key already exists with a different payload, chapter, or actor.',
                ], 409, ['Cache-Control' => 'no-store']);
            }

            if ($stageOne && $targetId && ! $this->matchesTarget($request, $existing, $targetId)) {
                throw new ContractException(409, 'action_key_conflict', 'Use a new action key for a different target.');
            }

            if ($existing->state === 'in_flight') {
                if ($stageOne) {
                    throw new ContractException(409, 'operation_in_flight', 'The operation is in flight.');
                }

                return response()->json([
                    'error' => 'OPERATION_IN_FLIGHT',
                    'code' => 'operation_in_flight',
                    'message' => 'An operation with this idempotency key is currently in flight.',
                ], 409, ['Cache-Control' => 'no-store']);
            }

            $decoded = json_decode($existing->response_body, true);
            $content = $decoded !== null ? $decoded : $existing->response_body;

            return response()->json($content, $existing->response_code, [
                'X-Action-Replayed' => 'true',
                'Cache-Control' => 'no-store',
            ]);
        }

        /** @var Response $response */
        $response = $next($request);

        if ($response->getStatusCode() >= 200 && $response->getStatusCode() < 300) {
            $alreadyRecorded = IdempotencyRecord::where('key', $idempotencyKey)->exists();

            if (! $alreadyRecorded) {
                $routeAction = $request->route()?->getActionName();
                $operationName = $routeAction && str_contains($routeAction, '@')
                    ? explode('@', $routeAction)[1]
                    : null;

                IdempotencyRecord::create([
                    'key' => $idempotencyKey,
                    'chapter_id' => $chapterId,
                    'user_id' => $userId,
                    'operation_name' => $operationName,
                    'resource_id' => $targetId,
                    'state' => 'committed',
                    'payload_hash' => $payloadHash,
                    'response_code' => $response->getStatusCode(),
                    'response_body' => $response->getContent(),
                    'expires_at' => now()->addDays(7),
                ]);
            }

            $response->headers->set('X-Action-Replayed', 'false');
            $response->headers->set('Cache-Control', 'no-store');
        }

        return $response;
    }

    private function matchesTarget(Request $request, IdempotencyRecord $record, string $targetId): bool
    {
        $result = json_decode($record->response_body, true);
        $rfId = $request->route('rf_id');
        if ($rfId && $rfId !== (data_get($result, 'data.rf_id') ?? data_get($result, 'data.result.rf_id') ?? $record->resource_id)) {
            return false;
        }
        if (in_array($record->operation_name, ['approveInternalRf', 'returnInternalRf'], true)) {
            $rf = InternalRf::where('chapter_id', $record->chapter_id)->whereKey($rfId)->first();
            if (! $rf || ! $request->attributes->get(ChapterAuthority::class)->routedRfApprover($rf)) {
                throw new ContractException(403, 'duty_denied', 'Current duty does not permit this action.');
            }
        }

        if ($record->operation_name === 'prepareActualIssue') {
            return $rfId === $targetId;
        }
        if ($record->operation_name === 'commitRfReservation') {
            return StockReservation::where('chapter_id', $record->chapter_id)
                ->where('id', $record->resource_id)->where('preparation_id', $targetId)->exists();
        }

        return $record->resource_id === $targetId;
    }
}
