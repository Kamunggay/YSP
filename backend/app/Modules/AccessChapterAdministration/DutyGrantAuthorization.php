<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use App\Modules\DocumentsReporting\CanonicalRequest;
use App\Modules\DocumentsReporting\ChapterOutcomes;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use stdClass;

final class DutyGrantAuthorization
{
    public function __construct(private ProtectedChapterExecution $execution, private CanonicalRequest $canonical, private ChapterOutcomes $outcomes, private SessionContract $contract) {}

    public function authorizeDutyGrant(Request $request, string $chapter_id): JsonResponse
    {
        if (! InitialHeadApproval::validId($chapter_id) || $request->getQueryString() !== null) {
            return $this->contract->failure('ChapterQueryInvalid', 400);
        }
        try {
            $body = $this->canonical->decode($request->getContent());
        } catch (\JsonException) {
            $body = null;
        }
        $keys = ['idempotency_key', 'expected_authority_version', 'expected_membership_version', 'expected_grant_version', 'membership_id', 'reason', 'grant'];
        if (! $request->isJson() || ! $this->closed($body, $keys)) {
            return $this->invalid('');
        }
        if (! is_string($body->idempotency_key) || ! preg_match('/^[A-Za-z0-9._:-]{1,128}$/D', $body->idempotency_key)) {
            return $this->invalid('/idempotency_key');
        }
        foreach (['expected_authority_version', 'expected_membership_version'] as $key) {
            if (! is_int($body->$key) || $body->$key < 1 || $body->$key > 4294967295) {
                return $this->invalid('/'.$key);
            }
        }
        if ($body->expected_grant_version !== null) {
            return $this->invalid('/expected_grant_version');
        }
        if (! InitialHeadApproval::validId($body->membership_id)) {
            return $this->invalid('/membership_id');
        }
        if (! is_string($body->reason) || mb_strlen($body->reason) < 1 || mb_strlen($body->reason) > 500) {
            return $this->invalid('/reason');
        }
        $terms = $body->grant;
        if (! $this->closed($terms, ['duty_code', 'scope_kind', 'requesting_unit_id', 'starts_at', 'ends_at', 'monetary_limit'])) {
            return $this->invalid('/grant');
        }
        if (! in_array($terms->duty_code, $this->contract->metadata()['duties'], true)) {
            return $this->invalid('/grant/duty_code');
        }
        if (! in_array($terms->scope_kind, ['chapter', 'unit'], true)
            || ($terms->scope_kind === 'chapter' ? $terms->requesting_unit_id !== null : ! InitialHeadApproval::validId($terms->requesting_unit_id))) {
            return $this->invalid('/grant/requesting_unit_id');
        }
        if (! $this->instant($terms->starts_at)) {
            return $this->invalid('/grant/starts_at');
        }
        if ($terms->ends_at !== null && (! $this->instant($terms->ends_at) || $terms->ends_at <= $terms->starts_at)) {
            return $this->invalid('/grant/ends_at');
        }
        if ($terms->monetary_limit !== null) {
            if (! $this->closed($terms->monetary_limit, ['currency', 'amount']) || $terms->monetary_limit->currency !== 'PHP'
                || ! is_string($terms->monetary_limit->amount) || ! preg_match('/^(?:0|[1-9][0-9]{0,17})\.[0-9]{2}$/D', $terms->monetary_limit->amount)) {
                return $this->invalid('/grant/monetary_limit');
            }
        }
        $fingerprint = $this->canonical->grantFingerprint($chapter_id, 'duty_grants.authorize', null, (string) $request->header('X-Chapter-Context'), $body);

        return $this->execution->execute($request, function (array $session, object $selection) use ($chapter_id, $body, $terms, $fingerprint): JsonResponse {
            $member = DB::table('memberships')->where('chapter_id', $chapter_id)->where('id', $body->membership_id)->lockForUpdate()->first();
            if ($member === null || ($terms->requesting_unit_id !== null && ! DB::table('requesting_units')
                ->where('chapter_id', $chapter_id)->where('id', $terms->requesting_unit_id)->where('active', true)->sharedLock()->exists())) {
                return response()->json(['code' => 'duty_grant_not_visible', 'message' => 'Duty grant unavailable.'], 404);
            }
            if ($member->row_version !== $body->expected_membership_version) {
                return $this->conflict('membership_stale');
            }
            if ($terms->starts_at < now()->format('Y-m-d\TH:i:s.u\Z')) {
                return $this->invalid('/grant/starts_at');
            }
            $user = DB::table('users')->where('id', $member->user_id)->lockForUpdate()->first();
            $actor = ['user_id' => $session['user']['id'], 'membership_id' => (string) $selection->membership_id,
                'authority_version' => $body->expected_authority_version,
                'duty_grants' => $this->execution->grants(DB::table('memberships')->where('id', $selection->membership_id)->first())];
            $at = now()->format('Y-m-d\TH:i:s.u\Z');
            $operation = ['identity' => ['operation_id' => (string) Str::ulid(), 'action_code' => 'duty_grants.authorize', 'idempotency_key' => $body->idempotency_key],
                'outcome' => 'committed', 'committed_at' => $at, 'replayed' => false];
            $blocked = $member->status !== 'active' || $member->disabled_at !== null || $member->revoked_at !== null
                || $user === null || $user->status !== 'active' || $user->disabled_at !== null
                || $member->row_version >= 4294967295 || $member->authority_version >= 2147483647 || $body->expected_authority_version >= 2147483647;
            $role = DB::table('roles')->where('code', $terms->duty_code)->value('id');
            if ($terms->monetary_limit !== null) {
                $approval = DB::table('duty_grant_limit_approvals')->where('chapter_id', $chapter_id)
                    ->where('assigning_membership_id', $selection->membership_id)->where('role_id', $role)
                    ->where('scope_kind', $terms->scope_kind)->where('requesting_unit_id', $terms->requesting_unit_id)
                    ->whereNull('revoked_at')->where('approved_at', '<=', now()->format('Y-m-d H:i:s.u'))
                    ->where('approved_by_user_id', '<>', $session['user']['id'])
                    ->where('monetary_limit', '>=', $terms->monetary_limit->amount)
                    ->where('starts_at', '<=', Carbon::parse($terms->starts_at)->format('Y-m-d H:i:s.u'));
                if ($terms->ends_at === null) {
                    $approval->whereNull('ends_at');
                } else {
                    $approval->where(fn ($query) => $query->whereNull('ends_at')->orWhere('ends_at', '>=', Carbon::parse($terms->ends_at)->format('Y-m-d H:i:s.u')));
                }
                if (! $approval->sharedLock()->exists()) {
                    return $this->contract->failure('SessionForbidden', 403, 'forbidden');
                }
            }
            // The chapter control guard and target membership are held before
            // this current locking read and remain held through outcome commit.
            $overlap = DB::table('duty_grants')->where('chapter_id', $chapter_id)->where('membership_id', $member->id)
                ->where('role_id', $role)->where('scope_kind', $terms->scope_kind)->where('requesting_unit_id', $terms->requesting_unit_id)
                ->whereNull('revoked_at')
                ->where(fn ($query) => $query->whereNull('ends_at')->orWhere('ends_at', '>', Carbon::parse($terms->starts_at)->format('Y-m-d H:i:s.u')));
            if ($terms->ends_at !== null) {
                $overlap->where('starts_at', '<', Carbon::parse($terms->ends_at)->format('Y-m-d H:i:s.u'));
            }
            if ($blocked || $overlap->lockForUpdate()->exists()) {
                $operation['outcome'] = 'rejected';
                $result = ['resource_type' => 'duty_grant', 'action_result' => 'blocked', 'chapter_id' => $chapter_id,
                    'operation' => $operation, 'code' => 'duty_grant_state_conflict',
                    'message' => 'Review the retained grant state.', 'next_action' => 'review_original_attempt'];
                $this->outcomes->record($chapter_id, $fingerprint, $actor, $member, $result, 409, $body);

                return response()->json($result, 409);
            }
            DB::table('duty_grants')->insert(['chapter_id' => $chapter_id, 'membership_id' => $member->id, 'role_id' => $role,
                'scope_kind' => $terms->scope_kind, 'requesting_unit_id' => $terms->requesting_unit_id,
                'monetary_limit' => $terms->monetary_limit?->amount, 'starts_at' => Carbon::parse($terms->starts_at)->format('Y-m-d H:i:s.u'),
                'ends_at' => $terms->ends_at === null ? null : Carbon::parse($terms->ends_at)->format('Y-m-d H:i:s.u'),
                'authorized_by_user_id' => $session['user']['id'], 'authorized_at' => Carbon::parse($at)->format('Y-m-d H:i:s.u')]);
            $id = DB::connection()->getPdo()->lastInsertId();
            DB::table('memberships')->where('id', $member->id)->update(['row_version' => $member->row_version + 1, 'authority_version' => $member->authority_version + 1]);
            $attribution = ['user_id' => $session['user']['id'], 'at' => $at];
            $grant = get_object_vars($terms) + ['id' => $id, 'chapter_id' => $chapter_id, 'membership_id' => (string) $member->id,
                'identity' => ['user_id' => (string) $user->id, 'display_name' => $user->name],
                'version' => 1, 'membership_version' => $member->row_version + 1, 'authority_version' => $member->authority_version + 1,
                'is_alternate' => false, 'replaces_grant_id' => null, 'revoked_at' => null,
                'authorized' => $attribution, 'last_changed' => $attribution,
                'history_reference' => 'gh_'.hash_hmac('sha256', $chapter_id.':'.$id, (string) config('app.key'))];
            $result = ['resource_type' => 'duty_grant', 'action_result' => 'success', 'chapter_id' => $chapter_id,
                'grant' => $grant, 'replaced_grant' => null, 'operation' => $operation];
            $this->outcomes->record($chapter_id, $fingerprint, $actor, $member, $result, 200, $body);
            $this->execution->advanceAuthority($selection, $chapter_id, $body->expected_authority_version);

            return response()->json($result);
        }, ['chapter_id' => $chapter_id, 'membership_id' => $this->selectedMembership($request),
            'target_membership_id' => $body->membership_id, 'expected_authority_version' => $body->expected_authority_version,
            'action' => 'duty_grants.authorize', 'membership_contract' => true],
            fn (array $session): ?JsonResponse => $this->outcomes->replay($chapter_id, 'duty_grants.authorize', $body->idempotency_key, $fingerprint, $session['user']['id']));
    }

    /** @param list<string> $keys */
    private function closed(mixed $value, array $keys): bool
    {
        return $value instanceof stdClass && count(get_object_vars($value)) === count($keys)
            && array_diff(array_keys(get_object_vars($value)), $keys) === [];
    }

    private function instant(mixed $value): bool
    {
        if (! is_string($value) || ! preg_match('/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/D', $value)) {
            return false;
        }
        try {
            return Carbon::parse($value)->format('Y-m-d\TH:i:s.u\Z') === $value && $value >= '1970-01-01T00:00:01.000000Z' && $value < '2038-01-19T03:14:07.000000Z';
        } catch (\Throwable) {
            return false;
        }
    }

    private function selectedMembership(Request $request): ?string
    {
        $id = DB::table('chapter_selections')->where('session_key', hash('sha256', $request->session()->getId()))->value('membership_id');

        return $id === null ? null : (string) $id;
    }

    private function conflict(string $code): JsonResponse
    {
        return response()->json(['code' => $code, 'message' => 'Review current authority and the original attempt.', 'next_action' => 'review_original_attempt'], 409);
    }

    private function invalid(string $path): JsonResponse
    {
        return response()->json(['code' => 'validation_failed', 'message' => 'Review marked fields.',
            'field_feedback' => [['path' => $path, 'code' => 'INVALID', 'message' => 'Review this field.']], 'next_action' => 'correct_fields'], 422);
    }

    public function readDutyCatalogue(Request $request, string $chapter_id): JsonResponse
    {
        $queryString = (string) $request->server('QUERY_STRING', '');
        if ($queryString !== '' || ! InitialHeadApproval::validId($chapter_id)) {
            return $this->invalidSelector();
        }

        return $this->execution->execute($request, function (): JsonResponse {
            $duties = $this->contract->metadata()['duties'];
            sort($duties);
            $items = array_map(fn (string $duty): array => ['duty_code' => $duty], $duties);

            return response()->json(['items' => $items]);
        }, ['chapter_id' => $chapter_id, 'membership_id' => $this->selectedMembership($request),
            'action' => 'duty_grants.read', 'membership_contract' => true]);
    }

    public function readDutyGrant(Request $request, string $chapter_id, string $grant_id): JsonResponse
    {
        $queryString = (string) $request->server('QUERY_STRING', '');
        if ($queryString !== '' || ! InitialHeadApproval::validId($chapter_id) || ! InitialHeadApproval::validId($grant_id)) {
            return $this->invalidSelector();
        }

        return $this->execution->execute($request, function () use ($chapter_id, $grant_id): JsonResponse {
            $row = DB::table('duty_grants')
                ->join('roles', 'roles.id', '=', 'duty_grants.role_id')
                ->join('memberships', 'memberships.id', '=', 'duty_grants.membership_id')
                ->join('users', 'users.id', '=', 'memberships.user_id')
                ->where('duty_grants.chapter_id', $chapter_id)
                ->where('duty_grants.id', $grant_id)
                ->select(
                    'duty_grants.*',
                    'roles.code as duty_code',
                    'memberships.row_version as membership_row_version',
                    'memberships.authority_version as membership_authority_version',
                    'users.id as user_id',
                    'users.name as user_name'
                )
                ->lockForUpdate()
                ->first();

            if ($row === null) {
                return response()->json([
                    'code' => 'duty_grant_not_visible',
                    'message' => 'Reference unavailable.',
                ], 404);
            }

            return response()->json($this->grantProjection($row));
        }, ['chapter_id' => $chapter_id, 'membership_id' => $this->selectedMembership($request),
            'action' => 'duty_grants.read', 'membership_contract' => true]);
    }

    public function listDutyGrants(Request $request, string $chapter_id): JsonResponse
    {
        $allowedKeys = ['membership_id', 'duty_code', 'scope_kind', 'requesting_unit_id', 'status', 'limit', 'cursor'];
        $seen = [];
        $queryString = (string) $request->server('QUERY_STRING', '');
        foreach ($queryString === '' ? [] : explode('&', $queryString) as $pair) {
            if ($pair === '') {
                continue;
            }
            $key = urldecode(explode('=', $pair, 2)[0]);
            if (! in_array($key, $allowedKeys, true) || isset($seen[$key]) || ! is_string($request->query($key))) {
                return $this->invalidSelector();
            }
            $seen[$key] = true;
        }

        if (! InitialHeadApproval::validId($chapter_id)) {
            return $this->invalidSelector();
        }

        $membershipId = $request->query('membership_id');
        if ($membershipId !== null && (! is_string($membershipId) || ! InitialHeadApproval::validId($membershipId))) {
            return $this->invalidSelector();
        }

        $dutyCode = $request->query('duty_code');
        if ($dutyCode !== null && (! is_string($dutyCode) || ! in_array($dutyCode, $this->contract->metadata()['duties'], true))) {
            return $this->invalidSelector();
        }

        $scopeKind = $request->query('scope_kind');
        if ($scopeKind !== null && (! is_string($scopeKind) || ! in_array($scopeKind, ['chapter', 'unit'], true))) {
            return $this->invalidSelector();
        }

        $requestingUnitId = $request->query('requesting_unit_id');
        if ($requestingUnitId !== null) {
            if (! is_string($requestingUnitId) || ! InitialHeadApproval::validId($requestingUnitId) || $scopeKind !== 'unit') {
                return $this->invalidSelector();
            }
        }

        $status = $request->query('status');
        if ($status !== null && (! is_string($status) || ! in_array($status, ['effective', 'scheduled', 'ended', 'revoked'], true))) {
            return $this->invalidSelector();
        }

        $limit = 50;
        if ($request->query('limit') !== null) {
            $limitStr = $request->query('limit');
            if (! is_string($limitStr) || ! preg_match('/^[1-9][0-9]*$/D', $limitStr) || (int) $limitStr < 1 || (int) $limitStr > 100) {
                return $this->invalidSelector();
            }
            $limit = (int) $limitStr;
        }

        $cursor = $request->query('cursor');
        if ($cursor !== null && (! is_string($cursor) || ! preg_match('/^cur_[A-Za-z0-9_-]{32,96}$/D', $cursor))) {
            return $this->invalidSelector();
        }

        return $this->execution->execute($request, function (array $session) use ($chapter_id, $membershipId, $dutyCode, $scopeKind, $requestingUnitId, $status, $limit, $cursor): JsonResponse {
            $actor = (string) $session['user']['id'];
            $lastId = null;
            $snapshotTime = (string) time();

            if ($cursor !== null) {
                $decoded = $this->decodeDutyGrantCursor($actor, $chapter_id, $cursor, $membershipId, $dutyCode, $scopeKind, $requestingUnitId, $status, $limit);
                if ($decoded instanceof JsonResponse) {
                    return $decoded;
                }
                [$lastId, $snapshotTime] = $decoded;
            }

            $stateHash = $this->dutyGrantStateHash($chapter_id);

            $query = DB::table('duty_grants')
                ->join('roles', 'roles.id', '=', 'duty_grants.role_id')
                ->join('memberships', 'memberships.id', '=', 'duty_grants.membership_id')
                ->join('users', 'users.id', '=', 'memberships.user_id')
                ->where('duty_grants.chapter_id', $chapter_id);

            if ($membershipId !== null) {
                $memberExists = DB::table('memberships')
                    ->where('chapter_id', $chapter_id)
                    ->where('id', $membershipId)
                    ->exists();
                if (! $memberExists) {
                    return response()->json([
                        'code' => 'duty_grant_not_visible',
                        'message' => 'Reference unavailable.',
                    ], 404);
                }
                $query->where('duty_grants.membership_id', $membershipId);
            }
            if ($dutyCode !== null) {
                $query->where('roles.code', $dutyCode);
            }
            if ($scopeKind !== null) {
                $query->where('duty_grants.scope_kind', $scopeKind);
            }
            if ($requestingUnitId !== null) {
                $unitExists = DB::table('requesting_units')
                    ->where('chapter_id', $chapter_id)
                    ->where('id', $requestingUnitId)
                    ->exists();
                if (! $unitExists) {
                    return response()->json([
                        'code' => 'duty_grant_not_visible',
                        'message' => 'Reference unavailable.',
                    ], 404);
                }
                $query->where('duty_grants.requesting_unit_id', $requestingUnitId);
            }
            if ($status !== null) {
                $snapshotUtc = Carbon::createFromTimestamp((int) $snapshotTime, 'UTC')->format('Y-m-d H:i:s.u');
                if ($status === 'effective') {
                    $query->whereNull('duty_grants.revoked_at')
                        ->where('duty_grants.starts_at', '<=', $snapshotUtc)
                        ->where(fn ($q) => $q->whereNull('duty_grants.ends_at')->orWhere('duty_grants.ends_at', '>', $snapshotUtc));
                } elseif ($status === 'scheduled') {
                    $query->whereNull('duty_grants.revoked_at')
                        ->where('duty_grants.starts_at', '>', $snapshotUtc);
                } elseif ($status === 'ended') {
                    $query->whereNull('duty_grants.revoked_at')
                        ->whereNotNull('duty_grants.ends_at')
                        ->where('duty_grants.ends_at', '<=', $snapshotUtc);
                } elseif ($status === 'revoked') {
                    $query->whereNotNull('duty_grants.revoked_at');
                }
            }

            if ($lastId !== null) {
                $query->where('duty_grants.id', '>', $lastId);
            }

            $rows = $query->select(
                'duty_grants.*',
                'roles.code as duty_code',
                'memberships.row_version as membership_row_version',
                'memberships.authority_version as membership_authority_version',
                'users.id as user_id',
                'users.name as user_name'
            )
                ->orderBy('duty_grants.id', 'asc')
                ->limit($limit + 1)
                ->lockForUpdate()
                ->get();

            $nextCursor = null;
            if ($rows->count() > $limit) {
                $items = $rows->slice(0, $limit);
                $lastItem = $items->last();
                $nextCursor = $this->encodeDutyGrantCursor($actor, $chapter_id, (string) $lastItem->id, $membershipId, $dutyCode, $scopeKind, $requestingUnitId, $status, $limit, "{$snapshotTime}_{$stateHash}");
            } else {
                $items = $rows;
            }

            $formatted = $items->map(fn (object $row): array => $this->grantProjection($row))->values()->all();

            return response()->json([
                'items' => $formatted,
                'next_cursor' => $nextCursor,
            ]);
        }, ['chapter_id' => $chapter_id, 'membership_id' => $this->selectedMembership($request),
            'action' => 'duty_grants.read', 'membership_contract' => true]);
    }

    private function dutyGrantStateHash(string $chapterId): string
    {
        $stats = DB::table('duty_grants')->where('chapter_id', $chapterId)
            ->selectRaw('COUNT(*) as cnt, COALESCE(MAX(id), 0) as max_id, COALESCE(SUM(row_version), 0) as sum_ver, COALESCE(MAX(row_version), 0) as max_ver, COUNT(revoked_at) as revoked_cnt')
            ->lockForUpdate()
            ->first();
        $raw = "{$stats->cnt}:{$stats->max_id}:{$stats->sum_ver}:{$stats->max_ver}:{$stats->revoked_cnt}";

        return substr(hash('sha256', $raw), 0, 16);
    }

    private function encodeDutyGrantCursor(string $actor, string $chapter, string $lastId, ?string $membershipId, ?string $dutyCode, ?string $scopeKind, ?string $requestingUnitId, ?string $status, int $limit, string $snapshot): string
    {
        $filterData = implode('|', [$membershipId ?? '', $dutyCode ?? '', $scopeKind ?? '', $requestingUnitId ?? '', $status ?? '']);
        $filterHash = substr(hash('sha256', $filterData), 0, 8);
        $payload = "{$lastId}.{$snapshot}.{$limit}.{$filterHash}";
        $b64Payload = rtrim(strtr(base64_encode($payload), '+/', '-_'), '=');
        $sigData = "{$actor}|{$chapter}|{$payload}";
        $rawHmac = substr(hash_hmac('sha256', $sigData, (string) config('app.key'), true), 0, 12);
        $b64Sig = rtrim(strtr(base64_encode($rawHmac), '+/', '-_'), '=');

        return "cur_{$b64Payload}{$b64Sig}";
    }

    /**
     * @return array{string, string}|JsonResponse
     */
    private function decodeDutyGrantCursor(string $actor, string $chapter, string $cursor, ?string $membershipId, ?string $dutyCode, ?string $scopeKind, ?string $requestingUnitId, ?string $status, int $limit): array|JsonResponse
    {
        if (strlen($cursor) < 36 || strlen($cursor) > 100 || ! str_starts_with($cursor, 'cur_')) {
            return $this->invalidSelector();
        }

        $b64Sig = substr($cursor, -16);
        $b64Payload = substr($cursor, 4, -16);

        $remainder = strlen($b64Payload) % 4;
        $padded = $remainder ? $b64Payload.str_repeat('=', 4 - $remainder) : $b64Payload;
        $payload = base64_decode(strtr($padded, '-_', '+/'), true);
        if ($payload === false) {
            return $this->invalidSelector();
        }

        $sigData = "{$actor}|{$chapter}|{$payload}";
        $expectedHmac = substr(hash_hmac('sha256', $sigData, (string) config('app.key'), true), 0, 12);
        $expectedB64Sig = rtrim(strtr(base64_encode($expectedHmac), '+/', '-_'), '=');
        if (! hash_equals($expectedB64Sig, $b64Sig)) {
            return $this->invalidSelector();
        }

        $parts = explode('.', $payload);
        if (count($parts) !== 4) {
            return $this->invalidSelector();
        }
        [$lastId, $snapshot, $cursorLimitStr, $cursorFilterHash] = $parts;

        if (! InitialHeadApproval::validId($lastId) || ! ctype_digit($cursorLimitStr)) {
            return $this->invalidSelector();
        }

        $expectedFilterData = implode('|', [$membershipId ?? '', $dutyCode ?? '', $scopeKind ?? '', $requestingUnitId ?? '', $status ?? '']);
        $expectedFilterHash = substr(hash('sha256', $expectedFilterData), 0, 8);
        if ($cursorFilterHash !== $expectedFilterHash || (int) $cursorLimitStr !== $limit) {
            return $this->invalidSelector();
        }

        $snapshotParts = explode('_', $snapshot, 2);
        if (count($snapshotParts) !== 2 || ! ctype_digit($snapshotParts[0])) {
            return $this->invalidSelector();
        }
        [$snapshotTime, $cursorStateHash] = $snapshotParts;

        if (abs(time() - (int) $snapshotTime) > 3600) {
            return $this->invalidSelector();
        }

        $currentStateHash = $this->dutyGrantStateHash($chapter);
        if (! hash_equals($currentStateHash, $cursorStateHash)) {
            return response()->json([
                'code' => 'grant_stale',
                'message' => 'Review the original attempt with current access.',
                'next_action' => 'review_original_attempt',
            ], 409);
        }

        return [$lastId, $snapshotTime];
    }

    /** @return array<string, mixed> */
    private function grantProjection(object $row): array
    {
        $attribution = fn ($id, $at) => ['user_id' => (string) $id, 'at' => Carbon::parse($at, 'UTC')->format('Y-m-d\TH:i:s.u\Z')];

        $monetaryLimit = null;
        if ($row->monetary_limit !== null) {
            $parts = explode('.', (string) $row->monetary_limit);
            $amount = $parts[0].'.'.str_pad($parts[1] ?? '00', 2, '0');
            $monetaryLimit = ['currency' => 'PHP', 'amount' => $amount];
        }

        $authorizedUserId = $row->authorized_by_user_id !== null ? (string) $row->authorized_by_user_id : (string) $row->user_id;
        $authorizedAt = $row->authorized_at !== null ? $row->authorized_at : $row->starts_at;

        return [
            'id' => (string) $row->id,
            'chapter_id' => (string) $row->chapter_id,
            'membership_id' => (string) $row->membership_id,
            'identity' => ['user_id' => (string) $row->user_id, 'display_name' => $row->user_name],
            'duty_code' => $row->duty_code,
            'scope_kind' => $row->scope_kind,
            'requesting_unit_id' => $row->requesting_unit_id !== null ? (string) $row->requesting_unit_id : null,
            'starts_at' => Carbon::parse($row->starts_at, 'UTC')->format('Y-m-d\TH:i:s.u\Z'),
            'ends_at' => $row->ends_at !== null ? Carbon::parse($row->ends_at, 'UTC')->format('Y-m-d\TH:i:s.u\Z') : null,
            'monetary_limit' => $monetaryLimit,
            'version' => (int) $row->row_version,
            'membership_version' => (int) $row->membership_row_version,
            'authority_version' => (int) $row->membership_authority_version,
            'is_alternate' => false,
            'replaces_grant_id' => null,
            'revoked_at' => $row->revoked_at !== null ? Carbon::parse($row->revoked_at, 'UTC')->format('Y-m-d\TH:i:s.u\Z') : null,
            'authorized' => $attribution($authorizedUserId, $authorizedAt),
            'last_changed' => $attribution($authorizedUserId, $authorizedAt),
            'history_reference' => 'gh_'.hash_hmac('sha256', (string) $row->chapter_id.':'.(string) $row->id, (string) config('app.key')),
        ];
    }

    private function invalidSelector(): JsonResponse
    {
        return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
    }
}
