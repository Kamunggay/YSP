<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use App\Modules\DocumentsReporting\CanonicalRequest;
use App\Modules\DocumentsReporting\ProviderOutcomes;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use JsonException;
use stdClass;

final class ChapterProvisioning
{
    /** @var list<string> */
    private const PROVISIONING_COLUMNS = [
        'chapter_provisionings.id as provisioning_id',
        'chapter_provisionings.organization_id',
        'chapter_provisionings.provider_user_id',
        'chapter_provisionings.chapter_id',
        'chapter_provisionings.status',
        'chapter_provisionings.row_version',
        'chapter_provisionings.created_at as provisioning_created_at',
        'chapters.code as chapter_code',
        'chapters.name as chapter_name',
        'users.name as user_name',
    ];

    public function __construct(private BrowserSessions $sessions, private SessionContract $contract, private CanonicalRequest $canonical, private ProviderOutcomes $outcomes) {}

    public function context(Request $request): JsonResponse
    {
        if ($request->getQueryString() !== null) {
            return $this->contract->failure('SessionForbidden', 403, 'forbidden');
        }

        return DB::transaction(function () use ($request): JsonResponse {
            $authority = $this->authorize($request);
            if ($authority instanceof JsonResponse) {
                return $authority;
            }
            [$user, $grant, $scope] = $authority;

            return response()->json(['scope' => $scope, 'authority_version' => $grant->authority_version,
                'available_actions' => ['provider.identities.reference.read', 'provider.chapters.prepare', 'provider.chapters.create', 'provider.initial_head.appoint']]);
        }, 3);
    }

    public function list(Request $request): JsonResponse
    {
        $rawQuery = (string) $request->server('QUERY_STRING', '');
        $seen = [];
        if ($rawQuery !== '') {
            foreach (explode('&', $rawQuery) as $pair) {
                if ($pair === '') {
                    continue;
                }
                $rawKey = explode('=', $pair, 2)[0];
                $decodedKey = urldecode($rawKey);
                if ($rawKey !== $decodedKey || ! in_array($rawKey, ['limit', 'status', 'cursor'], true) || isset($seen[$decodedKey]) || ! is_string($request->query($rawKey))) {
                    return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
                }
                $seen[$decodedKey] = true;
            }
        }

        $limit = 50;
        if (isset($seen['limit'])) {
            $limitVal = $request->query('limit');
            if (! is_string($limitVal) || ! preg_match('/^[1-9][0-9]*$/D', $limitVal)) {
                return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
            }
            $limit = (int) $limitVal;
            if ($limit < 1 || $limit > 100) {
                return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
            }
        }

        $status = null;
        if (isset($seen['status'])) {
            $statusVal = $request->query('status');
            if (! is_string($statusVal) || ! in_array($statusVal, ['awaiting_initial_head', 'initial_head_designated'], true)) {
                return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
            }
            $status = $statusVal;
        }

        $cursor = isset($seen['cursor']) ? $request->query('cursor') : null;
        if ($cursor !== null && (! is_string($cursor) || ! preg_match('/^cur_[A-Za-z0-9_-]{32,96}$/D', $cursor))) {
            return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
        }

        return DB::transaction(function () use ($request, $limit, $status, $cursor): JsonResponse {
            $authority = $this->authorize($request);
            if ($authority instanceof JsonResponse) {
                return $authority;
            }
            [$user, $grant, $scope] = $authority;

            $lastId = null;
            $snapshotTime = now()->format('YmdHisu');
            if ($cursor !== null) {
                $decoded = $this->decodeCursor($scope, $cursor, $status, $limit);
                if ($decoded instanceof JsonResponse) {
                    return $decoded;
                }
                [$lastId, $snapshotTime] = $decoded;
            }

            $queryBuilder = DB::table('chapter_provisionings')
                ->join('chapters', 'chapter_provisionings.chapter_id', '=', 'chapters.id')
                ->join('users', 'chapter_provisionings.provider_user_id', '=', 'users.id')
                ->where('chapter_provisionings.organization_id', $scope['organization_id'])
                ->where('chapter_provisionings.provider_user_id', $scope['provider_user_id']);

            if ($status !== null) {
                $queryBuilder->where('chapter_provisionings.status', $status);
            }

            if ($lastId !== null) {
                $queryBuilder->where('chapter_provisionings.id', '>', $lastId);
            }

            $rows = $queryBuilder
                ->select(self::PROVISIONING_COLUMNS)
                ->orderBy('chapter_provisionings.id', 'asc')
                ->limit($limit + 1)
                ->lockForUpdate()
                ->get();

            $nextCursor = null;
            if ($rows->count() > $limit) {
                $items = $rows->slice(0, $limit);
                $lastItem = $items->last();
                $nextCursor = $this->encodeCursor($scope, (string) $lastItem->provisioning_id, $status, $limit, $snapshotTime);
            } else {
                $items = $rows;
            }

            $formatted = $items->map(fn (stdClass $row): array => $this->formatProvisioning($row, $scope))->values()->all();

            return response()->json([
                'items' => $formatted,
                'limit' => $limit,
                'next_cursor' => $nextCursor,
            ]);
        }, 3);
    }

    /** @param array<string, string> $scope */
    private function encodeCursor(array $scope, string $lastId, ?string $status, int $limit, string $snapshotTime): string
    {
        $statusFlag = match ($status) {
            'awaiting_initial_head' => '1', 'initial_head_designated' => '2', default => '0'
        };
        $payload = "{$lastId}.{$snapshotTime}.{$statusFlag}.{$limit}";
        $b64Payload = rtrim(strtr(base64_encode($payload), '+/', '-_'), '=');
        $sigData = "{$scope['provider_user_id']}|{$scope['organization_id']}|{$payload}";
        $rawHmac = substr(hash_hmac('sha256', $sigData, (string) config('app.key'), true), 0, 16);
        $b64Sig = rtrim(strtr(base64_encode($rawHmac), '+/', '-_'), '=');

        return "cur_{$b64Payload}{$b64Sig}";
    }

    /**
     * @param  array<string, string>  $scope
     * @return array{string, string}|JsonResponse
     */
    private function decodeCursor(array $scope, string $cursor, ?string $status, int $limit): array|JsonResponse
    {
        if (strlen($cursor) < 36 || strlen($cursor) > 100 || ! str_starts_with($cursor, 'cur_')) {
            return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
        }

        $b64Sig = substr($cursor, -22);
        $b64Payload = substr($cursor, 4, -22);

        $remainder = strlen($b64Payload) % 4;
        $padded = $remainder ? $b64Payload.str_repeat('=', 4 - $remainder) : $b64Payload;
        $payload = base64_decode(strtr($padded, '-_', '+/'), true);
        if ($payload === false) {
            return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
        }

        $sigData = "{$scope['provider_user_id']}|{$scope['organization_id']}|{$payload}";
        $expectedHmac = substr(hash_hmac('sha256', $sigData, (string) config('app.key'), true), 0, 16);
        $expectedB64Sig = rtrim(strtr(base64_encode($expectedHmac), '+/', '-_'), '=');
        if (! hash_equals($expectedB64Sig, $b64Sig)) {
            return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
        }

        $parts = explode('.', $payload);
        if (count($parts) !== 4) {
            return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
        }
        [$lastId, $snapshotTimeStr, $cursorStatusFlag, $cursorLimitStr] = $parts;

        if (! preg_match('/^[1-9][0-9]{0,19}$/D', $lastId) || ! preg_match('/^[0-9]{20}$/D', $snapshotTimeStr) || ! ctype_digit($cursorLimitStr)) {
            return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
        }

        try {
            $snapshotDt = Carbon::createFromFormat('YmdHisu', $snapshotTimeStr);
        } catch (\Throwable) {
            $snapshotDt = null;
        }
        if ($snapshotDt === null || abs(now()->diffInSeconds($snapshotDt)) > 3600) {
            return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
        }

        $expectedStatusFlag = match ($status) {
            'awaiting_initial_head' => '1', 'initial_head_designated' => '2', default => '0'
        };
        if ($cursorStatusFlag !== $expectedStatusFlag || (int) $cursorLimitStr !== $limit) {
            return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
        }

        $stale = DB::table('chapter_provisionings')
            ->where('organization_id', $scope['organization_id'])
            ->where('provider_user_id', $scope['provider_user_id'])
            ->where('created_at', '>', $snapshotDt->format('Y-m-d H:i:s.u'))
            ->exists();

        if ($stale) {
            return response()->json([
                'code' => 'provisioning_snapshot_stale',
                'message' => 'Review the original attempt with current authority.',
                'next_action' => 'review_original_attempt',
            ], 409);
        }

        return [$lastId, $snapshotTimeStr];
    }

    /**
     * @param  array<string, string>  $scope
     * @return array<string, mixed>
     */
    private function formatProvisioning(stdClass $row, array $scope): array
    {
        return $this->withInitialHead([
            'id' => (string) $row->provisioning_id,
            'scope' => $scope,
            'chapter' => [
                'id' => (string) $row->chapter_id,
                'code' => $row->chapter_code,
                'name' => $row->chapter_name,
            ],
            'version' => (int) $row->row_version,
            'created_by' => [
                'user_id' => (string) $row->provider_user_id,
                'display_name' => $row->user_name,
            ],
            'created_at' => Carbon::parse($row->provisioning_created_at)->utc()->format('Y-m-d\TH:i:s.u\Z'),
            'status' => $row->status,
            'initial_head' => null,
            'initial_head_membership_authorization' => 'not_applicable',
        ]);
    }

    public function read(Request $request, string $provisioning_id): JsonResponse
    {
        if ($request->getQueryString() !== null || ! preg_match('/^[1-9][0-9]{0,19}$/D', $provisioning_id)) {
            return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
        }

        return DB::transaction(function () use ($request, $provisioning_id): JsonResponse {
            $authority = $this->authorize($request);
            if ($authority instanceof JsonResponse) {
                return $authority;
            }
            [$user, $grant, $scope] = $authority;

            $row = DB::table('chapter_provisionings')
                ->join('chapters', 'chapter_provisionings.chapter_id', '=', 'chapters.id')
                ->join('users', 'chapter_provisionings.provider_user_id', '=', 'users.id')
                ->where('chapter_provisionings.id', $provisioning_id)
                ->where('chapter_provisionings.organization_id', $scope['organization_id'])
                ->where('chapter_provisionings.provider_user_id', $scope['provider_user_id'])
                ->select(self::PROVISIONING_COLUMNS)
                ->lockForUpdate()
                ->first();

            if ($row === null) {
                return response()->json(['code' => 'provisioning_not_visible', 'message' => 'Provisioning is not available.'], 404);
            }

            return response()->json($this->formatProvisioning($row, $scope));
        }, 3);
    }

    public function lookupByKey(Request $request): JsonResponse
    {
        $rawQuery = (string) $request->server('QUERY_STRING', '');
        $seen = [];
        if ($rawQuery === '') {
            return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
        }
        foreach (explode('&', $rawQuery) as $pair) {
            if ($pair === '') {
                continue;
            }
            $rawKey = explode('=', $pair, 2)[0];
            $decodedKey = urldecode($rawKey);
            if ($rawKey !== $decodedKey || ! in_array($rawKey, ['action_code', 'idempotency_key'], true) || isset($seen[$decodedKey]) || ! is_string($request->query($rawKey))) {
                return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
            }
            $seen[$decodedKey] = true;
        }

        if (! isset($seen['action_code'], $seen['idempotency_key'])) {
            return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
        }

        $actionCode = $request->query('action_code');
        $idempotencyKey = $request->query('idempotency_key');
        if (! in_array($actionCode, ['provider.chapters.create', 'provider.initial_head.appoint'], true)
            || ! is_string($idempotencyKey)
            || ! preg_match('/^[A-Za-z0-9._:-]{1,128}$/D', $idempotencyKey)) {
            return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
        }

        return DB::transaction(function () use ($request, $actionCode, $idempotencyKey): JsonResponse {
            $authority = $this->authorize($request);
            if ($authority instanceof JsonResponse) {
                return $authority;
            }
            [$user, $grant, $scope] = $authority;

            $attempt = DB::table('provider_operation_attempts')
                ->where('organization_id', $scope['organization_id'])
                ->where('provider_user_id', $scope['provider_user_id'])
                ->where('action_code', $actionCode)
                ->where('idempotency_key', $idempotencyKey)
                ->first();

            return $this->formatLookupResult($scope, $attempt);
        }, 3);
    }

    public function lookupById(Request $request, string $operation_id): JsonResponse
    {
        if ($request->getQueryString() !== null || ! preg_match('/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/D', $operation_id)) {
            return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
        }

        return DB::transaction(function () use ($request, $operation_id): JsonResponse {
            $authority = $this->authorize($request);
            if ($authority instanceof JsonResponse) {
                return $authority;
            }
            [$user, $grant, $scope] = $authority;

            $attempt = DB::table('provider_operation_attempts')
                ->where('public_id', $operation_id)
                ->where('organization_id', $scope['organization_id'])
                ->where('provider_user_id', $scope['provider_user_id'])
                ->first();

            return $this->formatLookupResult($scope, $attempt);
        }, 3);
    }

    /** @param array<string, string> $scope */
    private function formatLookupResult(array $scope, ?object $attempt): JsonResponse
    {
        if ($attempt === null) {
            return response()->json([
                'resource_type' => 'provisioning',
                'action_result' => 'uncertain',
                'scope' => $scope,
                'lookup_state' => 'pending_or_not_visible',
                'operation' => null,
                'message' => 'Original outcome is not currently available.',
                'next_action' => 'lookup_original_attempt',
            ]);
        }

        $operation = DB::table('provider_operations')->where('attempt_id', $attempt->id)->first();
        if ($operation === null) {
            return response()->json([
                'resource_type' => 'provisioning',
                'action_result' => 'uncertain',
                'scope' => $scope,
                'lookup_state' => 'pending_or_not_visible',
                'operation' => null,
                'message' => 'Original outcome is not currently available.',
                'next_action' => 'lookup_original_attempt',
            ]);
        }

        $result = json_decode($operation->result_snapshot, true, flags: JSON_THROW_ON_ERROR);
        $result['operation']['replayed'] = true;

        return response()->json($result);
    }

    public function createProvisionedChapter(Request $request): JsonResponse
    {
        if ($request->getQueryString() !== null) {
            return $this->contract->failure('SessionForbidden', 403, 'forbidden');
        }
        try {
            $body = $this->canonical->decode($request->getContent());
        } catch (JsonException) {
            $body = null;
        }
        $errors = $this->invalidFields($body);
        if (! $request->isJson() || $errors !== []) {
            return response()->json(['code' => 'validation_failed', 'message' => 'Check the submitted fields.',
                'field_feedback' => array_map(fn (string $path): array => ['path' => $path, 'code' => 'INVALID', 'message' => 'Check this field.'], $errors ?: ['']),
                'next_action' => 'correct_fields'], 422);
        }
        $operationId = (string) Str::ulid();

        return DB::transaction(function () use ($request, $body, $operationId): JsonResponse {
            $authority = $this->authorize($request);
            if ($authority instanceof JsonResponse) {
                return $authority;
            }
            [$user, $grant, $scope] = $authority;
            $fingerprint = $this->canonical->fingerprint((object) $scope, $body);
            $replay = $this->outcomes->replay($scope, 'provider.chapters.create', $body->idempotency_key, $fingerprint);
            if ($replay !== null) {
                return $replay;
            }
            if ($grant->authority_version !== $body->expected_provider_authority_version) {
                return response()->json(['code' => 'provider_authority_stale', 'message' => 'Review the original immutable attempt.',
                    'next_action' => 'review_original_attempt'], 409);
            }
            $time = now();
            if (DB::table('chapters')->where('organization_id', $scope['organization_id'])->where('code', $body->chapter->code)->lockForUpdate()->first() !== null) {
                $result = ['resource_type' => 'provisioning', 'action_result' => 'blocked', 'scope' => $scope,
                    'provisioning_id' => null, 'code' => 'chapter_code_unavailable',
                    'message' => 'Provisioning cannot accept this action.', 'next_action' => 'review_original_attempt',
                    'operation' => ['identity' => ['operation_id' => $operationId, 'action_code' => 'provider.chapters.create',
                        'idempotency_key' => $body->idempotency_key], 'outcome' => 'rejected',
                        'committed_at' => $time->format('Y-m-d\TH:i:s.u\Z'), 'replayed' => false]];
                $this->outcomes->record($scope, 'provider.chapters.create', $body->idempotency_key,
                    $fingerprint, $operationId, $grant, ['user_id' => (string) $user->id, 'display_name' => $user->name],
                    $result, $time->format('Y-m-d H:i:s.u'), 409);

                return response()->json($result, 409);
            }
            DB::table('chapters')->insert([
                'organization_id' => $scope['organization_id'], 'code' => $body->chapter->code,
                'name' => $body->chapter->name, 'provisioned_by_user_id' => $user->id,
            ]);
            $chapter = DB::connection()->getPdo()->lastInsertId();
            DB::table('chapter_control_guards')->insert(['chapter_id' => $chapter]);
            DB::table('chapter_provisionings')->insert([
                'organization_id' => $scope['organization_id'], 'provider_user_id' => $user->id,
                'chapter_id' => $chapter, 'created_at' => $time->format('Y-m-d H:i:s.u'),
            ]);
            $provisioning = DB::connection()->getPdo()->lastInsertId();
            $actor = ['user_id' => (string) $user->id, 'display_name' => $user->name];
            $instant = $time->format('Y-m-d\TH:i:s.u\Z');
            $result = ['resource_type' => 'provisioning', 'action_result' => 'success', 'scope' => $scope,
                'provisioning' => ['id' => (string) $provisioning, 'scope' => $scope,
                    'chapter' => ['id' => (string) $chapter, 'code' => $body->chapter->code, 'name' => $body->chapter->name],
                    'version' => 1, 'created_by' => $actor, 'created_at' => $instant,
                    'status' => 'awaiting_initial_head', 'initial_head' => null, 'initial_head_membership_authorization' => 'not_applicable'],
                'operation' => ['identity' => ['operation_id' => $operationId, 'action_code' => 'provider.chapters.create',
                    'idempotency_key' => $body->idempotency_key], 'outcome' => 'committed', 'committed_at' => $instant, 'replayed' => false]];
            $this->outcomes->record($scope, 'provider.chapters.create', $body->idempotency_key,
                $fingerprint, $operationId, $grant, $actor, $result, $time->format('Y-m-d H:i:s.u'), 200);

            return response()->json($result);
        }, 3);
    }

    public function lookupProvisioningIdentity(Request $request, InitialHeadApproval $candidates): JsonResponse
    {
        if ($request->getQueryString() !== null || strlen($request->getContent()) > 8192) {
            return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
        }
        try {
            $body = $this->canonical->decode($request->getContent());
        } catch (JsonException) {
            $body = null;
        }
        if (! $request->isJson() || ! $body instanceof stdClass || array_keys(get_object_vars($body)) !== ['user_id']
            || ! InitialHeadApproval::validId($body->user_id)) {
            return response()->json(['code' => 'validation_failed', 'message' => 'Check the submitted fields.',
                'field_feedback' => [['path' => '/user_id', 'code' => 'INVALID', 'message' => 'Check this field.']],
                'next_action' => 'correct_fields'], 422);
        }

        return DB::transaction(function () use ($request, $body, $candidates): JsonResponse {
            $authority = $this->authorize($request);
            if ($authority instanceof JsonResponse) {
                return $authority;
            }
            [$user, $grant, $scope] = $authority;
            $key = hash('sha256', 'initial-head-lookup:'.$user->id);
            DB::table('session_throttles')->insertOrIgnore(['key' => $key, 'attempts' => 0, 'expires_at' => time() + 900]);
            $counter = DB::table('session_throttles')->where('key', $key)->lockForUpdate()->first();
            if ($counter->expires_at <= time()) {
                DB::table('session_throttles')->where('key', $key)->update(['attempts' => 0, 'expires_at' => time() + 900]);
            } elseif ($counter->attempts >= 60) {
                return response()->json(['code' => 'throttled', 'message' => 'Try again after the indicated delay.'], 429)
                    ->header('Retry-After', (string) max(1, $counter->expires_at - time()));
            }
            DB::table('session_throttles')->where('key', $key)->increment('attempts');
            $identity = $candidates->eligible($scope['organization_id'], $body->user_id);

            return response()->json(['identity' => $identity === null ? null : ['user_id' => (string) $identity->id, 'display_name' => $identity->name]]);
        }, 3);
    }

    /** @param array<string, mixed> $projection
     * @return array<string, mixed>
     */
    private function withInitialHead(array $projection): array
    {
        $designation = DB::table('initial_head_designations')->where('provisioning_id', $projection['id'])->first();
        if ($designation !== null) {
            $projection['status'] = 'initial_head_designated';
            $projection['initial_head'] = json_decode($designation->appointment_snapshot, true, flags: JSON_THROW_ON_ERROR);
            $bootstrap = DB::table('initial_head_bootstraps')->where('designation_id', $designation->id)->first();
            $projection['initial_head_membership_authorization'] = 'not_authorized';
            if ($bootstrap !== null) {
                $active = DB::table('memberships')->join('duty_grants', function ($join): void {
                    $join->on('duty_grants.membership_id', '=', 'memberships.id')->on('duty_grants.chapter_id', '=', 'memberships.chapter_id');
                })->join('users', 'users.id', '=', 'memberships.user_id')
                    ->where('memberships.id', $bootstrap->membership_id)->where('memberships.status', 'active')->whereNull('memberships.disabled_at')
                    ->where('users.status', 'active')->whereNull('users.disabled_at')
                    ->where('duty_grants.id', $bootstrap->duty_grant_id)->whereNull('duty_grants.revoked_at')->where('duty_grants.starts_at', '<=', now())
                    ->where(fn ($query) => $query->whereNull('duty_grants.ends_at')->orWhere('duty_grants.ends_at', '>', now()))->exists();
                $projection['initial_head_membership_authorization'] = $active ? 'authorized' : 'ended';
            }
        }

        return $projection;
    }

    public function appointInitialHead(Request $request, string $provisioning_id, InitialHeadApproval $candidates): JsonResponse
    {
        if ($request->getQueryString() !== null || ! InitialHeadApproval::validId($provisioning_id) || strlen($request->getContent()) > 8192) {
            return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
        }
        try {
            $body = $this->canonical->decode($request->getContent());
        } catch (JsonException) {
            $body = null;
        }
        $errors = $this->invalidAppointment($body);
        if (! $request->isJson() || $errors !== []) {
            return response()->json(['code' => 'validation_failed', 'message' => 'Check the submitted fields.',
                'field_feedback' => array_map(fn (string $path): array => ['path' => $path, 'code' => 'INVALID', 'message' => 'Check this field.'], $errors ?: ['']),
                'next_action' => 'correct_fields'], 422);
        }
        $operationId = (string) Str::ulid();

        return DB::transaction(function () use ($request, $body, $provisioning_id, $candidates, $operationId): JsonResponse {
            $authority = $this->authorize($request);
            if ($authority instanceof JsonResponse) {
                return $authority;
            }
            [$user, $grant, $scope] = $authority;
            $action = 'provider.initial_head.appoint';
            $hash = $this->canonical->fingerprint((object) $scope, $body, $action, $provisioning_id);
            $replay = $this->outcomes->replay($scope, $action, $body->idempotency_key, $hash);
            if ($replay !== null) {
                return $replay;
            }
            $row = DB::table('chapter_provisionings')->where('id', $provisioning_id)
                ->where('organization_id', $scope['organization_id'])->where('provider_user_id', $user->id)->lockForUpdate()->first();
            if ($row === null) {
                return response()->json(['code' => 'provisioning_not_visible', 'message' => 'Provisioning is not available.'], 404);
            }
            $stale = $grant->authority_version !== $body->expected_provider_authority_version ? 'provider_authority_stale'
                : ($row->row_version !== $body->expected_provisioning_version ? 'provisioning_stale' : null);
            if ($stale !== null) {
                return response()->json(['code' => $stale, 'message' => 'Review the original immutable attempt.', 'next_action' => 'review_original_attempt'], 409);
            }
            $identity = $candidates->eligible($scope['organization_id'], $body->identity->user_id);
            $now = now();
            $time = $now->format('Y-m-d H:i:s.u');
            $instant = $now->utc()->format('Y-m-d\TH:i:s.u\Z');
            $actor = ['user_id' => (string) $user->id, 'display_name' => $user->name];
            $operation = ['identity' => ['operation_id' => $operationId, 'action_code' => $action, 'idempotency_key' => $body->idempotency_key],
                'outcome' => 'committed', 'committed_at' => $instant, 'replayed' => false];
            if ($identity === null || $row->status !== 'awaiting_initial_head') {
                $operation['outcome'] = 'rejected';
                $result = ['resource_type' => 'provisioning', 'action_result' => 'blocked', 'scope' => $scope,
                    'provisioning_id' => $provisioning_id, 'operation' => $operation,
                    'code' => $identity === null ? 'identity_not_eligible' : 'initial_head_already_designated',
                    'message' => 'Provisioning cannot accept this action.', 'next_action' => 'review_original_attempt'];
                $this->outcomes->record($scope, $action, $body->idempotency_key, $hash, $operationId, $grant, $actor, $result, $time, 409);

                return response()->json($result, 409);
            }
            $chapter = DB::table('chapters')->where('id', $row->chapter_id)->first();
            $appointment = ['identity' => ['user_id' => (string) $identity->id, 'display_name' => $identity->name],
                'appointed_by' => $actor, 'appointed_at' => $instant];
            $result = ['resource_type' => 'provisioning', 'action_result' => 'success', 'scope' => $scope,
                'provisioning' => ['id' => $provisioning_id, 'scope' => $scope,
                    'chapter' => ['id' => (string) $row->chapter_id, 'code' => $chapter->code, 'name' => $chapter->name],
                    'version' => $row->row_version + 1, 'created_by' => $actor,
                    'created_at' => Carbon::parse($row->created_at)->utc()->format('Y-m-d\TH:i:s.u\Z'),
                    'status' => 'initial_head_designated', 'initial_head' => $appointment, 'initial_head_membership_authorization' => 'not_authorized'],
                'operation' => $operation];
            $this->outcomes->record($scope, $action, $body->idempotency_key, $hash, $operationId, $grant, $actor, $result, $time, 200);
            DB::table('initial_head_designations')->insert(['provisioning_id' => $provisioning_id, 'chapter_id' => $row->chapter_id,
                'user_id' => $identity->id, 'operation_public_id' => $operationId,
                'appointment_snapshot' => json_encode($appointment, JSON_THROW_ON_ERROR), 'reason' => $body->reason, 'appointed_at' => $time]);
            DB::table('chapter_provisionings')->where('id', $row->id)->update(['status' => 'initial_head_designated', 'row_version' => $row->row_version + 1]);

            return response()->json($result);
        }, 3);
    }

    /** @return list<string> */
    private function invalidAppointment(mixed $body): array
    {
        if (! $body instanceof stdClass || array_diff(array_keys(get_object_vars($body)),
            ['idempotency_key', 'expected_provider_authority_version', 'expected_provisioning_version', 'identity', 'reason']) !== []) {
            return [''];
        }
        $errors = [];
        if (! isset($body->idempotency_key) || ! is_string($body->idempotency_key) || ! preg_match('/^[A-Za-z0-9._:-]{1,128}$/D', $body->idempotency_key)) {
            $errors[] = '/idempotency_key';
        }
        foreach (['expected_provider_authority_version', 'expected_provisioning_version'] as $field) {
            if (! isset($body->{$field}) || ! is_int($body->{$field}) || $body->{$field} < 1 || $body->{$field} >= 2147483647) {
                $errors[] = '/'.$field;
            }
        }
        if (! isset($body->identity) || ! $body->identity instanceof stdClass || array_keys(get_object_vars($body->identity)) !== ['user_id']
            || ! InitialHeadApproval::validId($body->identity->user_id)) {
            $errors[] = '/identity/user_id';
        }
        if (! isset($body->reason) || ! is_string($body->reason) || mb_strlen($body->reason) > 1000 || ! preg_match('/(*UCP)\S/u', $body->reason)) {
            $errors[] = '/reason';
        }

        return $errors;
    }

    /** @return array{object, object, array<string, string>}|JsonResponse */
    private function authorize(Request $request): array|JsonResponse
    {
        $user = DB::table('users')->where('id', $request->session()->get('identity_id'))->lockForUpdate()->first();
        $snapshot = $this->sessions->snapshot($request);
        if ($user === null || $snapshot['state'] === 'signed_out') {
            return $this->contract->failure('EnrollmentUnauthorized', 401);
        }
        if ($request->hasHeader('X-Chapter-Context')
            || $snapshot['state'] !== 'authenticated' || ($snapshot['mfa']['status'] ?? '') !== 'verified') {
            return $this->contract->failure('SessionForbidden', 403, 'forbidden');
        }
        $grants = DB::table('provider_role_grants')->where('user_id', $user->id)->where('role_code', 'provisioner')
            ->whereNull('revoked_at')->where('starts_at', '<=', now())
            ->where(fn ($query) => $query->whereNull('ends_at')->orWhere('ends_at', '>', now()))
            ->orderBy('id')->lockForUpdate()->get();
        if ($grants->count() !== 1) {
            return $this->contract->failure('SessionForbidden', 403, 'forbidden');
        }
        $grant = $grants->first();
        // Organization lock also serializes competing chapter codes across actors.
        DB::table('organizations')->where('id', $grant->organization_id)->lockForUpdate()->first();

        return [$user, $grant, ['kind' => 'provisioner', 'organization_id' => (string) $grant->organization_id, 'provider_user_id' => (string) $user->id]];
    }

    /** @return list<string> */
    private function invalidFields(mixed $body): array
    {
        if (! $body instanceof stdClass || array_diff(array_keys(get_object_vars($body)), ['idempotency_key', 'expected_provider_authority_version', 'chapter']) !== []) {
            return [''];
        }
        $errors = [];
        if (! isset($body->idempotency_key) || ! is_string($body->idempotency_key) || ! preg_match('/^[A-Za-z0-9._:-]{1,128}$/D', $body->idempotency_key)) {
            $errors[] = '/idempotency_key';
        }
        if (! isset($body->expected_provider_authority_version) || ! is_int($body->expected_provider_authority_version)
            || $body->expected_provider_authority_version < 1 || $body->expected_provider_authority_version > 2147483647) {
            $errors[] = '/expected_provider_authority_version';
        }
        if (! isset($body->chapter) || ! $body->chapter instanceof stdClass || array_diff(array_keys(get_object_vars($body->chapter)), ['code', 'name']) !== []) {
            $errors[] = '/chapter';
        } else {
            if (! isset($body->chapter->code) || ! is_string($body->chapter->code) || ! preg_match('/^[A-Z][A-Z0-9_-]{0,31}$/D', $body->chapter->code)) {
                $errors[] = '/chapter/code';
            }
            if (! isset($body->chapter->name) || ! is_string($body->chapter->name) || mb_strlen($body->chapter->name) > 160 || ! preg_match('/(*UCP)\S/u', $body->chapter->name)) {
                $errors[] = '/chapter/name';
            }
        }

        return $errors;
    }
}
