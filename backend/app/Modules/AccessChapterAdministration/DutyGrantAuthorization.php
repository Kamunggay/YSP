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
}
