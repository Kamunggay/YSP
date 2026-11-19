<?php

namespace App\Http\Middleware;

use App\Models\Chapter;
use App\Models\IdempotencyRecord;
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

        $userId = $request->header('X-User-Id') ?? session('user_id');
        $rawContent = $request->getContent();
        $decodedBody = $rawContent !== '' ? json_decode($rawContent, true) : null;
        $payloadHash = (json_last_error() === JSON_ERROR_NONE && is_array($decodedBody))
            ? CanonicalJson::sha256($decodedBody)
            : hash('sha256', $rawContent);

        $existing = IdempotencyRecord::where('key', $idempotencyKey)->first();

        if ($existing) {
            if (
                $existing->chapter_id !== $chapterId
                || $existing->user_id !== $userId
                || $existing->payload_hash !== $payloadHash
            ) {
                return response()->json([
                    'error' => 'IDEMPOTENCY_CONFLICT',
                    'code' => 'action_key_conflict',
                    'message' => 'An operation with this idempotency key already exists with a different payload, chapter, or actor.',
                ], 409, ['Cache-Control' => 'no-store']);
            }

            if ($existing->state === 'in_flight') {
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
}
