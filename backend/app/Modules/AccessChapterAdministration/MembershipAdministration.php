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

final class MembershipAdministration
{
    public function __construct(private ProtectedChapterExecution $execution, private CanonicalRequest $canonical, private ChapterOutcomes $outcomes) {}

    public function authorizeMembership(Request $request, string $chapter_id): JsonResponse
    {
        return $this->mutate($request, $chapter_id, null, 'memberships.authorize');
    }

    public function disableMembership(Request $request, string $chapter_id, string $membership_id): JsonResponse
    {
        return $this->mutate($request, $chapter_id, $membership_id, 'memberships.disable');
    }

    public function revokeMembership(Request $request, string $chapter_id, string $membership_id): JsonResponse
    {
        return $this->mutate($request, $chapter_id, $membership_id, 'memberships.revoke');
    }

    private function mutate(Request $request, string $chapter_id, ?string $membership_id, string $action): JsonResponse
    {
        if (! InitialHeadApproval::validId($chapter_id) || ($membership_id !== null && ! InitialHeadApproval::validId($membership_id)) || $request->getQueryString() !== null) {
            return $this->invalidSelector();
        }
        try {
            $body = $this->canonical->decode($request->getContent());
        } catch (\JsonException) {
            return $this->invalid('');
        }
        $authorize = $action === 'memberships.authorize';
        $keys = ['idempotency_key', 'expected_authority_version', 'expected_membership_version'];
        if ($authorize) {
            $keys[] = 'identity';
        }
        if (! $body instanceof stdClass || array_diff(array_keys(get_object_vars($body)), $keys) !== []
            || ! isset($body->idempotency_key) || ! is_string($body->idempotency_key) || ! preg_match('/^[A-Za-z0-9._:-]{1,128}$/D', $body->idempotency_key)
            || ! isset($body->expected_authority_version) || ! $this->version($body->expected_authority_version)
            || ! property_exists($body, 'expected_membership_version') || (! ($authorize && $body->expected_membership_version === null) && ! $this->version($body->expected_membership_version))
            || ($authorize && (! isset($body->identity) || ! $body->identity instanceof stdClass || array_keys(get_object_vars($body->identity)) !== ['user_id'] || ! InitialHeadApproval::validId($body->identity->user_id)))) {
            return $this->invalid('');
        }

        $fingerprint = $this->canonical->chapterFingerprint($chapter_id, $action, $membership_id, (string) $request->header('X-Chapter-Context'), $body);
        $operationId = (string) Str::ulid();

        return $this->execution->execute($request, function (array $session, object $selection) use ($body, $chapter_id, $membership_id, $action, $authorize, $fingerprint, $operationId): JsonResponse {
            $actor = ['user_id' => $session['user']['id'], 'membership_id' => (string) $selection->membership_id,
                'authority_version' => $body->expected_authority_version,
                'duty_grants' => $this->execution->grants(DB::table('memberships')->where('id', $selection->membership_id)->first())];
            $query = DB::table('memberships')->where('chapter_id', $chapter_id);
            $before = ($authorize ? $query->where('user_id', $body->identity->user_id) : $query->where('id', $membership_id))->lockForUpdate()->first();
            if (! $authorize && $before === null) {
                return response()->json(['code' => 'membership_not_visible', 'message' => 'Membership is not visible.'], 404);
            }
            $userId = $authorize ? $body->identity->user_id : (string) $before->user_id;
            $user = DB::table('users')->where('id', $userId)->where('status', 'active')->whereNull('disabled_at')->lockForUpdate()->first();
            $candidate = $authorize ? DB::table('membership_candidates')->where('chapter_id', $chapter_id)->where('user_id', $userId)
                ->where('purpose', 'membership_authorization')->whereNull('revoked_at')->where('authorized_at', '<=', now())
                ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', now()))->lockForUpdate()->first() : null;
            if ($user === null || ($authorize && $candidate === null)) {
                return $this->invalid('/identity/user_id');
            }

            if (($before === null ? null : $before->row_version) !== $body->expected_membership_version) {
                return $this->conflict('membership_stale');
            }
            if ($body->expected_authority_version >= 2147483647) {
                return $this->conflict('authority_stale');
            }
            $time = now()->format('Y-m-d\TH:i:s.u\Z');
            $operation = ['identity' => ['operation_id' => $operationId, 'action_code' => $action,
                'idempotency_key' => $body->idempotency_key], 'outcome' => 'committed', 'committed_at' => $time, 'replayed' => false];
            if ($before !== null && (($authorize && $before->status === 'active') || (! $authorize && $before->status !== 'active')
                || $before->row_version >= 4294967295 || $before->authority_version >= 2147483647)) {
                $operation['outcome'] = 'rejected';
                $result = ['resource_type' => 'membership', 'action_result' => 'blocked', 'chapter_id' => $chapter_id,
                    'operation' => $operation, 'code' => 'membership_state_conflict',
                    'message' => 'Review the retained membership state.', 'next_action' => 'review_original_attempt'];
                $this->outcomes->record($chapter_id, $fingerprint, $actor, $before, $result, 409);

                return response()->json($result, 409);
            }
            $dbTime = Carbon::parse($time)->format('Y-m-d H:i:s.u');
            if ($before === null) {
                DB::table('memberships')->insert(['chapter_id' => $chapter_id, 'user_id' => $user->id,
                    'authorized_by_user_id' => $session['user']['id'], 'authorized_at' => $dbTime]);
                $id = DB::connection()->getPdo()->lastInsertId();
            } else {
                $id = (string) $before->id;
                $changes = ['status' => $authorize ? 'active' : ($action === 'memberships.disable' ? 'disabled' : 'revoked'),
                    'row_version' => $before->row_version + 1, 'authority_version' => $before->authority_version + 1,
                    'disabled_at' => ! $authorize && $action === 'memberships.disable' ? $dbTime : null,
                    'revoked_at' => ! $authorize && $action === 'memberships.revoke' ? $dbTime : null,
                    'ended_by_user_id' => $authorize ? null : $session['user']['id']];
                if ($authorize) {
                    $changes += ['authorized_by_user_id' => $session['user']['id'], 'authorized_at' => $dbTime];
                } else {
                    $before->duty_grants = DB::table('duty_grants')->where('membership_id', $id)->lockForUpdate()->get()->all();
                    DB::table('duty_grants')->where('membership_id', $id)->whereNull('revoked_at')->update(['revoked_at' => $dbTime]);
                }
                DB::table('memberships')->where('id', $id)->update($changes);
                if (! $authorize && $id === (string) $selection->membership_id) {
                    $selection->ended_actor_version = $changes['row_version'];
                    $selection->ended_actor_grants = $actor['duty_grants'];
                }
            }
            $member = DB::table('memberships')->where('id', $id)->first();
            $result = ['resource_type' => 'membership', 'action_result' => 'success', 'chapter_id' => $chapter_id,
                'membership' => $this->projection($member, $user),
                'operation' => $operation];
            $this->outcomes->record($chapter_id, $fingerprint, $actor, $before, $result, 200);
            $this->execution->advanceAuthority($selection, $chapter_id, $body->expected_authority_version);

            return response()->json($result);
        }, ['chapter_id' => $chapter_id, 'membership_id' => $this->selectedMembership($request),
            'expected_authority_version' => $body->expected_authority_version, 'action' => $action, 'membership_contract' => true],
            fn (array $session): ?JsonResponse => $this->outcomes->replay($chapter_id, $action, $body->idempotency_key, $fingerprint, $session['user']['id']));
    }

    public function lookupByKey(Request $request, string $chapter_id): JsonResponse
    {
        $seen = [];
        foreach (explode('&', (string) $request->server('QUERY_STRING', '')) as $pair) {
            $key = urldecode(explode('=', $pair, 2)[0]);
            if (! in_array($key, ['action_code', 'idempotency_key'], true) || isset($seen[$key]) || ! is_string($request->query($key))) {
                return $this->outcomes->failure($chapter_id, 400);
            }
            $seen[$key] = true;
        }
        $action = $request->query('action_code');
        $key = $request->query('idempotency_key');
        if (! InitialHeadApproval::validId($chapter_id) || ! is_string($action) || ! preg_match('/^[a-z][a-z0-9_.-]{0,63}$/D', $action)
            || ! is_string($key) || ! preg_match('/^[A-Za-z0-9._:-]{1,128}$/D', $key)) {
            return $this->outcomes->failure($chapter_id, 400);
        }

        return $this->lookup($request, $chapter_id, ['action_code' => $action, 'idempotency_key' => $key]);
    }

    public function lookupById(Request $request, string $chapter_id, string $operation_id): JsonResponse
    {
        if (! InitialHeadApproval::validId($chapter_id) || $request->getQueryString() !== null || ! preg_match('/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/D', $operation_id)) {
            return $this->outcomes->failure($chapter_id, 400);
        }

        return $this->lookup($request, $chapter_id, ['public_id' => $operation_id]);
    }

    /** @param array<string, string> $selector */
    private function lookup(Request $request, string $chapter, array $selector): JsonResponse
    {
        try {
            $response = $this->execution->withCurrentAccess($request, $chapter, 'memberships.read', function (array $session) use ($request, $chapter, $selector): JsonResponse {
                $action = $selector['action_code'] ?? DB::table('chapter_operations')->where('chapter_id', $chapter)->where('public_id', $selector['public_id'])->value('action_code');

                return $this->execution->withCurrentAccess($request, $chapter, $this->lookupAction($action),
                    fn (): JsonResponse => $this->outcomes->lookup($chapter, $selector, $session['user']['id']));
            });
        } catch (\Throwable $error) {
            report($error);

            return $this->outcomes->failure($chapter, 503);
        }

        return in_array($response->getStatusCode(), [401, 403], true) ? $this->outcomes->failure($chapter, $response->getStatusCode()) : $response;
    }

    private function lookupAction(?string $action): string
    {
        return $action !== null && in_array($action, ['memberships.authorize', 'memberships.disable', 'memberships.revoke'], true) ? $action : 'memberships.read';
    }

    private function invalidSelector(): JsonResponse
    {
        return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
    }

    /** @return array<string, mixed> */
    private function projection(object $member, object $user): array
    {
        $attribution = fn ($id, $at) => ['user_id' => (string) $id, 'at' => Carbon::parse($at, 'UTC')->format('Y-m-d\TH:i:s.u\Z')];

        return ['membership_id' => (string) $member->id, 'chapter_id' => (string) $member->chapter_id,
            'identity' => ['user_id' => (string) $user->id, 'display_name' => $user->name],
            'status' => $member->status === 'active' ? 'authorized' : $member->status,
            'version' => $member->row_version, 'authority_version' => $member->authority_version,
            'authorized' => $attribution($member->authorized_by_user_id, $member->authorized_at),
            'disabled' => $member->status === 'disabled' ? $attribution($member->ended_by_user_id, $member->disabled_at) : null,
            'revoked' => $member->status === 'revoked' ? $attribution($member->ended_by_user_id, $member->revoked_at) : null,
            'history_reference' => 'mh_'.hash_hmac('sha256', (string) $member->chapter_id.':'.$member->id, (string) config('app.key'))];
    }

    private function conflict(string $code): JsonResponse
    {
        return response()->json(['code' => $code, 'message' => 'Review the original scope and attempt.', 'next_action' => 'review_original_attempt'], 409);
    }

    private function selectedMembership(Request $request): ?string
    {
        $id = DB::table('chapter_selections')->where('session_key', hash('sha256', $request->session()->getId()))->value('membership_id');

        return $id === null ? null : (string) $id;
    }

    private function version(mixed $version): bool
    {
        return is_int($version) && $version >= 1 && $version <= 4294967295;
    }

    private function invalid(string $path): JsonResponse
    {
        return response()->json(['code' => 'validation_failed', 'message' => 'Review marked fields.',
            'field_feedback' => [['path' => $path, 'code' => 'INVALID', 'message' => 'Review this field.']], 'next_action' => 'correct_fields'], 422);
    }
}
