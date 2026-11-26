<?php

declare(strict_types=1);

namespace App\Modules\DocumentsReporting;

use App\Modules\InventoryCustody\InventoryFingerprint;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use JsonException;
use RuntimeException;
use Throwable;

/**
 * Shared transport-v1 decoder, strict Idempotency-Key/RFC 8785 replay guard,
 * ActionResult builder, scoped operation lookup, and HMAC cursor pagination.
 */
final class ChapterOutcomes
{
    public function __construct(private CanonicalRequest $canonical) {}

    /** @return array{key: string, input: array<string, mixed>}|JsonResponse */
    public function decodeMutation(Request $req, int $chapterId): array|JsonResponse
    {
        $rawKey = $req->headers->get('Idempotency-Key');
        if (! is_string($rawKey) || preg_match('/^[A-Za-z0-9._:-]{1,128}$/D', $rawKey) !== 1) {
            $res = $this->blocked($chapterId, 422, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key header is required (1..128 safe characters, no whitespace).');

            return response()->json($res['body'], $res['http_status']);
        }
        $in = $this->decodeObject($req, $chapterId);

        return $in instanceof JsonResponse ? $in : ['key' => $rawKey, 'input' => $in];
    }

    /** @return array<string, mixed>|JsonResponse */
    public function decodeObject(Request $req, ?int $chapterId = null): array|JsonResponse
    {
        if (! $req->isJson()) {
            $res = $this->blocked($chapterId, 422, 'INVALID_INPUT', 'Content-Type must be application/json.');

            return response()->json($res['body'], $res['http_status']);
        }
        $raw = $req->getContent();
        if (trim($raw) === '') {
            return [];
        }
        try {
            $decoded = $this->canonical->decode($raw);
        } catch (JsonException) {
            $res = $this->blocked($chapterId, 422, 'INVALID_JSON', 'Malformed or duplicate-key JSON payload.');

            return response()->json($res['body'], $res['http_status']);
        }
        if (! is_object($decoded)) {
            $res = $this->blocked($chapterId, 422, 'INVALID_INPUT', 'Request body must be a JSON object.');

            return response()->json($res['body'], $res['http_status']);
        }

        /** @var array<string, mixed> $assoc */
        $assoc = json_decode(json_encode($decoded, JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR);
        $forbidden = array_values(array_intersect(array_keys($assoc), ['chapter_id', 'action_code', 'idempotency_key', 'expected_version']));
        if ($forbidden !== []) {
            $fb = array_map(fn (string $k): array => [
                'path' => "/{$k}", 'code' => 'UNSUPPORTED_FIELD',
                'message' => 'Use expected_row_version and route/header context per transport v1.',
            ], $forbidden);
            $res = $this->blocked($chapterId, 422, 'UNSUPPORTED_FIELD', 'Unsupported transport context override or legacy version field.', $fb);

            return response()->json($res['body'], $res['http_status']);
        }

        return $assoc;
    }

    /** @param array<string, mixed> $input */
    public static function fingerprint(int $chapterId, string $actionCode, string $inputSchema, array $input): string
    {
        return InventoryFingerprint::sha256Hex([
            'chapter_id' => $chapterId,
            'action_code' => $actionCode,
            'input_schema' => $inputSchema,
            'input' => $input,
        ]);
    }

    /** @return array{http_status: int, body: array<string, mixed>}|null */
    public function replay(int $chapterId, string $action, string $key, string $hash): ?array
    {
        $attempt = DB::table('inventory_operation_attempts')
            ->where('chapter_id', $chapterId)->where('action_code', $action)->where('idempotency_key', $key)->first();
        if ($attempt === null) {
            return null;
        }
        if (! hash_equals((string) $attempt->payload_hash, $hash)) {
            return $this->blocked(
                $chapterId, 409, 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
                'Idempotency-Key was already committed with a different canonical payload.', [],
                'review_record', 'Review the original attempt'
            );
        }
        $op = DB::table('inventory_operations')->where('attempt_id', (int) $attempt->id)->first();
        if ($op === null) {
            throw new RuntimeException('Committed operation snapshot missing for attempt.');
        }

        /** @var array<string, mixed> $snap */
        $snap = json_decode((string) $op->result_snapshot, true, flags: JSON_THROW_ON_ERROR);
        if (is_array($snap['operation'] ?? null)) {
            $snap['operation']['replayed'] = true;
        }

        return ['http_status' => (int) $op->http_status, 'body' => $snap];
    }

    public function beginAttempt(int $chapterId, int $userId, string $action, string $key, string $hash, string $schema, string $publicId, string $now): int
    {
        return DB::table('inventory_operation_attempts')->insertGetId([
            'public_id' => $publicId, 'chapter_id' => $chapterId, 'user_id' => $userId,
            'action_code' => $action, 'idempotency_key' => $key, 'payload_hash' => $hash,
            'input_schema' => $schema, 'created_at' => $now,
        ]);
    }

    /**
     * @param  array<string, mixed>  $actor
     * @param  array<string, mixed>  $body
     * @return array{http_status: int, body: array<string, mixed>}
     */
    public function finishAttempt(int $chapterId, int $attemptId, array $actor, string $action, array $body, int $status, string $now): array
    {
        $attrId = DB::table('inventory_actor_attributions')->insertGetId([
            'attempt_id' => $attemptId, 'chapter_id' => $chapterId,
            'membership_id' => $actor['membership_id'] ?? null, 'duty_grant_id' => $actor['duty_grant_id'] ?? null,
            'authority_version' => (int) ($actor['authority_version'] ?? 1),
            'actor_snapshot' => json_encode($actor, JSON_THROW_ON_ERROR), 'occurred_at' => $now,
        ]);
        $outcome = is_array($body['operation'] ?? null) ? (string) ($body['operation']['outcome'] ?? 'committed') : ($status >= 400 ? 'rejected' : 'committed');
        $opId = DB::table('inventory_operations')->insertGetId([
            'chapter_id' => $chapterId, 'attempt_id' => $attemptId, 'actor_attribution_id' => $attrId,
            'outcome' => $outcome, 'http_status' => $status,
            'result_snapshot' => json_encode($body, JSON_THROW_ON_ERROR), 'committed_at' => $now,
        ]);
        DB::table('inventory_audit_events')->insert([
            'chapter_id' => $chapterId, 'operation_id' => $opId, 'event_code' => "{$action}.{$outcome}",
            'after_snapshot' => json_encode($body['data'] ?? $body, JSON_THROW_ON_ERROR), 'occurred_at' => $now,
        ]);

        return ['http_status' => $status, 'body' => $body];
    }

    /**
     * @param  array<string, mixed>  $actor
     * @param  array<string, mixed>  $recordState
     * @param  array<string, mixed>  $data
     * @return array{http_status: int, body: array<string, mixed>}
     */
    public function commitSuccess(int $chapterId, array $actor, string $action, string $key, string $hash, string $schema, array $recordState, array $data, int $status = 200, ?string $opPublicId = null): array
    {
        $now = now()->format('Y-m-d H:i:s.u');
        $pubId = $opPublicId ?? InventoryFingerprint::newPublicId();
        $attemptId = $this->beginAttempt($chapterId, (int) $actor['user_id'], $action, $key, $hash, $schema, $pubId, $now);
        $body = $this->successEnvelope($chapterId, $pubId, $action, $key, $now, $recordState, $data);

        return $this->finishAttempt($chapterId, $attemptId, $actor, $action, $body, $status, $now);
    }

    /**
     * @param  array<string, mixed>  $recordState
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function successEnvelope(int $chapterId, string $opPublicId, string $action, string $key, string $nowDb, array $recordState, array $data): array
    {
        return [
            'schema_version' => '1.0',
            'chapter_id' => (string) $chapterId,
            'action_result' => 'success',
            'operation' => [
                'identity' => ['operation_id' => $opPublicId, 'action_code' => $action, 'idempotency_key' => $key],
                'outcome' => 'committed',
                'committed_at' => CarbonImmutable::parse($nowDb, 'UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'replayed' => false,
            ],
            'record' => $recordState,
            'field_feedback' => [],
            'blocking_reason' => null,
            'permitted_next_actions' => [['code' => 'review_record', 'label' => 'Review the recorded result']],
            'input_policy' => 'may_clear',
            'lookup_state' => null,
            'data' => $data,
        ];
    }

    /** @param array<string, string> $states
     * @return array<string, mixed> */
    public static function recordState(string $id, string $kind, int $rowVersion, int $materialVersion, array $states): array
    {
        return [
            'reference' => ['id' => $id, 'kind' => $kind],
            'row_version' => max(1, $rowVersion),
            'material_version' => max(1, $materialVersion),
            'states' => $states,
        ];
    }

    /** @param list<array{path: string, code: string, message: string}> $fieldFeedback
     * @return array{http_status: int, body: array<string, mixed>} */
    public function blocked(?int $chapterId, int $status, string $code, string $message, array $fieldFeedback = [], string $nextCode = 'correct_input', string $nextLabel = 'Correct the submitted input'): array
    {
        return ['http_status' => $status, 'body' => [
            'schema_version' => '1.0',
            'chapter_id' => $chapterId !== null ? (string) $chapterId : null,
            'action_result' => 'blocked',
            'operation' => null,
            'record' => null,
            'field_feedback' => $fieldFeedback,
            'blocking_reason' => ['code' => $code, 'message' => $message],
            'permitted_next_actions' => [['code' => $nextCode, 'label' => $nextLabel]],
            'input_policy' => 'preserve',
            'lookup_state' => null,
        ]];
    }

    /** @param array<string, mixed> $recordState
     * @return array{http_status: int, body: array<string, mixed>} */
    public function stale(int $chapterId, array $recordState, string $code = 'STALE_RECORD_VERSION', string $message = 'Record changed; reload current state before retrying.'): array
    {
        return ['http_status' => 409, 'body' => [
            'schema_version' => '1.0',
            'chapter_id' => (string) $chapterId,
            'action_result' => 'stale',
            'operation' => null,
            'record' => $recordState,
            'field_feedback' => [],
            'blocking_reason' => ['code' => $code, 'message' => $message],
            'permitted_next_actions' => [['code' => 'refresh_record', 'label' => 'Refresh the current record state']],
            'input_policy' => 'preserve',
            'lookup_state' => null,
        ]];
    }

    /** @return array{http_status: int, body: array<string, mixed>} */
    public function forbidden(string $code, string $message): array
    {
        return ['http_status' => 403, 'body' => [
            'schema_version' => '1.0',
            'chapter_id' => null,
            'action_result' => 'forbidden',
            'operation' => null,
            'record' => null,
            'field_feedback' => [],
            'blocking_reason' => ['code' => $code, 'message' => $message],
            'permitted_next_actions' => [],
            'input_policy' => 'preserve',
            'lookup_state' => 'not_applicable',
        ]];
    }

    /** @return array{http_status: int, body: array<string, mixed>} */
    public function lookupByKey(Request $r, int $chapterId): array
    {
        $q = $r->query();
        if (array_diff(array_keys($q), ['action_code', 'idempotency_key']) !== []
            || ! is_string($q['action_code'] ?? null) || ! is_string($q['idempotency_key'] ?? null)
            || preg_match('/^[a-z][a-z0-9_.-]{0,63}$/D', $q['action_code']) !== 1
            || preg_match('/^[A-Za-z0-9._:-]{1,128}$/D', $q['idempotency_key']) !== 1) {
            return $this->blocked($chapterId, 400, 'INVALID_LOOKUP', 'Supply action_code and idempotency_key together, or use the scoped operation-ID route.', [], 'correct_input', 'Correct the lookup selector');
        }
        $attempt = DB::table('inventory_operation_attempts')->where('chapter_id', $chapterId)
            ->where('action_code', $q['action_code'])->where('idempotency_key', $q['idempotency_key'])->first();

        return $this->formatLookup($chapterId, $attempt, $q['action_code'], $q['idempotency_key'], null);
    }

    /** @return array{http_status: int, body: array<string, mixed>} */
    public function lookupById(Request $r, int $chapterId, string $operationId): array
    {
        if ($r->getQueryString() !== null || preg_match('/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/D', $operationId) !== 1) {
            return $this->blocked($chapterId, 400, 'INVALID_LOOKUP', 'Supply action_code and idempotency_key together, or use the scoped operation-ID route.', [], 'correct_input', 'Correct the lookup selector');
        }
        $attempt = DB::table('inventory_operation_attempts')->where('chapter_id', $chapterId)->where('public_id', $operationId)->first();

        return $this->formatLookup($chapterId, $attempt, null, null, $operationId);
    }

    /** @param array<string, mixed> $query
     * @return array{ok: true, limit: int, after_id: int, encode_cursor: callable(int): string}|array{ok: false, error: array{http_status: int, body: array<string, mixed>}} */
    public function parseCursor(int $chapterId, string $surface, array $query): array
    {
        $limit = 50;
        if (isset($query['limit'])) {
            if (! is_string($query['limit']) || preg_match('/^[1-9][0-9]*$/D', $query['limit']) !== 1 || (int) $query['limit'] < 1 || (int) $query['limit'] > 100) {
                return ['ok' => false, 'error' => $this->blocked($chapterId, 400, 'INVALID_SELECTOR', 'limit must be an integer between 1 and 100.')];
            }
            $limit = (int) $query['limit'];
        }
        $afterId = 0;
        if (isset($query['cursor'])) {
            $cursor = $query['cursor'];
            if (! is_string($cursor) || strlen($cursor) < 36 || strlen($cursor) > 100 || ! str_starts_with($cursor, 'cur_')) {
                return ['ok' => false, 'error' => $this->blocked($chapterId, 400, 'INVALID_SELECTOR', 'Malformed pagination cursor.')];
            }
            $sig = substr($cursor, -22);
            $b64 = substr($cursor, 4, -22);
            $rem = strlen($b64) % 4;
            $raw = base64_decode(strtr($rem !== 0 ? $b64.str_repeat('=', 4 - $rem) : $b64, '-_', '+/'), true);
            if ($raw === false) {
                return ['ok' => false, 'error' => $this->blocked($chapterId, 400, 'INVALID_SELECTOR', 'Malformed pagination cursor.')];
            }
            $expSig = rtrim(strtr(base64_encode(substr(hash_hmac('sha256', "{$chapterId}|{$surface}|{$raw}", (string) config('app.key'), true), 0, 16)), '+/', '-_'), '=');
            if (! hash_equals($expSig, $sig)) {
                return ['ok' => false, 'error' => $this->blocked($chapterId, 400, 'INVALID_SELECTOR', 'Invalid pagination cursor signature.')];
            }
            $parts = explode('.', $raw);
            if (count($parts) !== 3 || ! ctype_digit($parts[0]) || ! ctype_digit($parts[1]) || ! ctype_digit($parts[2]) || (int) $parts[2] !== $limit) {
                return ['ok' => false, 'error' => $this->blocked($chapterId, 400, 'INVALID_SELECTOR', 'Cursor parameters do not match query.')];
            }
            try {
                $dt = CarbonImmutable::createFromFormat('YmdHisu', $parts[1], 'UTC');
            } catch (Throwable) {
                $dt = null;
            }
            if ($dt === null || abs(now()->diffInSeconds($dt)) > 3600) {
                return ['ok' => false, 'error' => $this->blocked($chapterId, 400, 'INVALID_SELECTOR', 'Expired pagination cursor.')];
            }
            $afterId = (int) $parts[0];
        }
        $snapTime = now()->format('YmdHisu');

        return [
            'ok' => true, 'limit' => $limit, 'after_id' => $afterId,
            'encode_cursor' => static function (int $lastId) use ($chapterId, $surface, $snapTime, $limit): string {
                $payload = "{$lastId}.{$snapTime}.{$limit}";
                $b64 = rtrim(strtr(base64_encode($payload), '+/', '-_'), '=');
                $sig = rtrim(strtr(base64_encode(substr(hash_hmac('sha256', "{$chapterId}|{$surface}|{$payload}", (string) config('app.key'), true), 0, 16)), '+/', '-_'), '=');

                return "cur_{$b64}{$sig}";
            },
        ];
    }

    /** @return array{http_status: int, body: array<string, mixed>} */
    private function formatLookup(int $chapterId, ?object $attempt, ?string $action, ?string $key, ?string $opId): array
    {
        $op = $attempt !== null ? DB::table('inventory_operations')->where('attempt_id', (int) $attempt->id)->first() : null;
        if ($attempt === null || $op === null) {
            return ['http_status' => 200, 'body' => [
                'schema_version' => '1.0',
                'chapter_id' => (string) $chapterId,
                'action_result' => 'uncertain',
                'operation' => [
                    'identity' => ['operation_id' => $attempt !== null ? (string) $attempt->public_id : $opId, 'action_code' => $action, 'idempotency_key' => $key],
                    'outcome' => 'unknown', 'committed_at' => null, 'replayed' => false,
                ],
                'record' => null,
                'field_feedback' => [],
                'blocking_reason' => [
                    'code' => 'NO_VISIBLE_TERMINAL_RESULT',
                    'message' => 'No authorized terminal result is visible. The original request may still be in flight; failure is not established.',
                ],
                'permitted_next_actions' => [
                    ['code' => 'lookup_operation', 'label' => 'Check this chapter and action using the original key'],
                    ['code' => 'reconcile_activity', 'label' => 'Preserve and reconcile any actual physical activity'],
                ],
                'input_policy' => 'preserve',
                'lookup_state' => 'pending_or_not_visible',
            ]];
        }

        /** @var array<string, mixed> $snap */
        $snap = json_decode((string) $op->result_snapshot, true, flags: JSON_THROW_ON_ERROR);
        if (is_array($snap['operation'] ?? null)) {
            $snap['operation']['replayed'] = true;
        }
        $snap['input_policy'] = 'may_clear';
        $snap['lookup_state'] = null;

        return ['http_status' => 200, 'body' => $snap];
    }
}
