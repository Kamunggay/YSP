<?php

namespace App\Http\Middleware;

use App\Models\IdempotencyRecord;
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

        $chapterId = $request->route('chapter_id') ?? $request->header('X-Chapter-Id');
        $userId = $request->header('X-User-Id') ?? session('user_id');
        $content = $request->getContent();
        $payloadHash = hash('sha256', $content);

        $existing = IdempotencyRecord::where('key', $idempotencyKey)->first();

        if ($existing) {
            if ($existing->payload_hash !== $payloadHash) {
                return response()->json([
                    'error' => 'IDEMPOTENCY_CONFLICT',
                    'code' => 'action_key_conflict',
                    'message' => 'An operation with this idempotency key already exists with a different payload.',
                ], 409);
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
            IdempotencyRecord::create([
                'key' => $idempotencyKey,
                'chapter_id' => $chapterId,
                'user_id' => $userId,
                'payload_hash' => $payloadHash,
                'response_code' => $response->getStatusCode(),
                'response_body' => $response->getContent(),
                'expires_at' => now()->addDays(7),
            ]);

            $response->headers->set('Cache-Control', 'no-store');
        }

        return $response;
    }
}
