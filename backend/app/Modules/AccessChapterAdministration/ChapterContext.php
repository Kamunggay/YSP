<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use App\Modules\DocumentsReporting\CanonicalRequest;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use JsonException;
use stdClass;

final class ChapterContext
{
    public function __construct(private ProtectedChapterExecution $execution, private SessionContract $contract) {}

    public function context(Request $request): JsonResponse
    {
        if (! $this->selectors($request, ['chapter_id'])
            || ($request->query('chapter_id') !== null && ! InitialHeadApproval::validId($request->query('chapter_id')))) {
            return $this->invalidQuery();
        }

        return $this->execution->execute($request, function (array $session, object $selection) use ($request): JsonResponse {
            $memberships = $this->execution->memberships($session['user']['id']);
            $member = null;
            $source = 'restored';
            foreach ($memberships as $membership) {
                if ((string) $membership->id === (string) $selection->membership_id) {
                    $member = $membership;
                }
            }
            if ($member === null && $selection->membership_id !== null) {
                $this->execution->rotate($selection, null);

                return $this->execution->stale();
            }
            if ($member === null && count($memberships) === 1) {
                $member = $memberships[0];
                $source = 'sole_membership';
            }
            if ($request->query('chapter_id') !== null && ($member === null || (string) $member->chapter_id !== $request->query('chapter_id'))) {
                return $this->execution->stale();
            }
            if ($source === 'sole_membership') {
                $this->execution->rotate($selection, (string) $member->id);
            }

            return response()->json($member === null
                ? ['session' => $session, 'selection_revision' => $selection->revision,
                    'chapter_state' => $memberships === [] ? 'no_authorized_memberships' : 'selection_required']
                : $this->selected($session, $selection, $member, $source));
        });
    }

    public function select(Request $request, CanonicalRequest $canonical): JsonResponse
    {
        if (! $this->selectors($request, []) || ! preg_match('/^ctx_[A-Za-z0-9_-]{32,96}$/D', (string) $request->header('X-Chapter-Context'))) {
            return $this->invalidQuery();
        }
        try {
            $body = strlen($request->getContent()) <= 4096 && $request->isJson() ? $canonical->decode($request->getContent()) : null;
        } catch (JsonException) {
            $body = null;
        }
        $errors = [];
        foreach (['chapter_id', 'membership_id'] as $field) {
            if (! $body instanceof stdClass || ! InitialHeadApproval::validId($body->$field ?? null)) {
                $errors[] = '/'.$field;
            }
        }
        if (! $body instanceof stdClass || ! is_int($body->expected_membership_version ?? null)
            || $body->expected_membership_version < 1 || $body->expected_membership_version > 2147483647) {
            $errors[] = '/expected_membership_version';
        }
        if ($body instanceof stdClass && array_diff(array_keys(get_object_vars($body)), ['chapter_id', 'membership_id', 'expected_membership_version']) !== []) {
            $errors[] = '/chapter_id';
        }
        if ($errors !== []) {
            return response()->json(['code' => 'invalid_input', 'message' => 'Check the submitted fields.',
                'field_errors' => array_map(fn (string $pointer): array => ['pointer' => $pointer, 'code' => 'invalid', 'message' => 'Check this field.'], array_values(array_unique($errors)))], 422);
        }

        return $this->execution->execute($request, function (array $session, object $selection) use ($request, $body): JsonResponse {
            if (($stale = $this->execution->verifyRevision($request, $selection)) !== null) {
                return $stale;
            }
            $memberships = $this->execution->memberships($session['user']['id']);
            if ($selection->membership_id !== null && ! in_array((string) $selection->membership_id,
                array_map(fn (object $member): string => (string) $member->id, $memberships), true)) {
                return $this->execution->stale();
            }
            foreach ($memberships as $member) {
                if ((string) $member->id === $body->membership_id && (string) $member->chapter_id === $body->chapter_id) {
                    if ($member->authority_version !== $body->expected_membership_version) {
                        return $this->execution->stale();
                    }
                    $this->execution->rotate($selection, (string) $member->id);

                    return response()->json($this->selected($session, $selection, $member, 'explicit'));
                }
            }

            return $this->contract->failure('SessionForbidden', 403, 'forbidden');
        });
    }

    /** @param list<string> $allowed */
    private function selectors(Request $request, array $allowed): bool
    {
        $seen = [];
        $query = $request->server('QUERY_STRING', '');
        foreach ($query === '' ? [] : explode('&', $query) as $pair) {
            $key = urldecode(explode('=', $pair, 2)[0]);
            if (! in_array($key, $allowed, true) || isset($seen[$key]) || ! is_string($request->query($key))) {
                return false;
            }
            $seen[$key] = true;
        }

        return true;
    }

    private function invalidQuery(): JsonResponse
    {
        return response()->json(['code' => 'invalid_selector', 'message' => 'Use only the documented single-valued selectors.'], 400);
    }

    public function memberships(Request $request): JsonResponse
    {
        $limit = $request->query('limit', '25');
        $cursor = $request->query('cursor');
        if (! $this->selectors($request, ['limit', 'cursor']) || ! is_string($limit) || ! preg_match('/^[1-9][0-9]{0,2}$/D', $limit)
            || (int) $limit > 100 || ($cursor !== null && (! is_string($cursor) || ! preg_match('/^cur_[A-Za-z0-9_-]{32,96}$/D', $cursor)))) {
            return $this->invalidQuery();
        }
        $limit = (int) $limit;

        return $this->execution->execute($request, function (array $session) use ($cursor, $limit): JsonResponse {
            $user = $session['user']['id'];
            $epoch = DB::table('users')->where('id', $user)->value('auth_version');
            $after = null;
            if ($cursor !== null) {
                $stored = DB::table('membership_cursors')->where('token', $cursor)->where('user_id', $user)
                    ->where('auth_version', $epoch)->where('page_limit', $limit)->where('expires_at', '>', now())->first();
                if ($stored === null) {
                    return $this->invalidQuery();
                }
                $after = (string) $stored->after_chapter_id;
            }
            $members = $this->execution->memberships($user, $after, $limit + 1);
            $next = null;
            if (count($members) > $limit) {
                array_pop($members);
                $next = 'cur_'.bin2hex(random_bytes(32));
                DB::table('membership_cursors')->insert(['token' => $next, 'user_id' => $user, 'auth_version' => $epoch,
                    'page_limit' => $limit, 'after_chapter_id' => $members[array_key_last($members)]->chapter_id,
                    'expires_at' => now()->addMinutes(15)]);
            }

            return response()->json(['session' => $session, 'items' => array_map($this->choice(...), $members),
                'limit' => $limit, 'next_cursor' => $next]);
        });
    }

    /** @return array<string, mixed> */
    private function choice(object $member): array
    {
        return ['chapter_id' => (string) $member->chapter_id, 'chapter_name' => $member->chapter_name,
            'membership_id' => (string) $member->id, 'membership_version' => $member->authority_version];
    }

    /** @param array<string, mixed> $session
     * @return array<string, mixed>
     */
    private function selected(array $session, object $selection, object $member, string $source): array
    {
        $grants = $this->execution->grants($member);
        $actions = $this->execution->actions($grants);
        $guard = DB::table('chapter_control_guards')->where('chapter_id', $member->chapter_id)->lockForUpdate()->first();
        $providers = DB::table('provider_role_grants')->where('user_id', $session['user']['id'])->whereNull('revoked_at')
            ->where('starts_at', '<=', now())->where(fn ($query) => $query->whereNull('ends_at')->orWhere('ends_at', '>', now()))
            ->orderBy('role_code')->lockForUpdate()->pluck('role_code')->unique()->values()->all();

        return ['session' => $session, 'selection_revision' => $selection->revision, 'chapter_state' => 'selected',
            'selection_source' => $source, 'membership' => $this->choice($member),
            'context' => ['schema_version' => '1.0', 'user_id' => $session['user']['id'], 'chapter_id' => (string) $member->chapter_id,
                'chapter_name' => $member->chapter_name, 'membership_id' => (string) $member->id,
                'authority_version' => $guard->authority_version, 'checked_at' => now()->format('Y-m-d\TH:i:s.u\Z'),
                'mfa_satisfied' => true, 'provider_roles' => $providers, 'available_actions' => $actions,
                'duty_grants' => array_map(fn (object $grant): array => [
                    'id' => (string) $grant->id, 'duty_code' => $grant->duty_code, 'scope_kind' => $grant->scope_kind,
                    'requesting_unit_id' => $grant->requesting_unit_id === null ? null : (string) $grant->requesting_unit_id,
                    'starts_at' => Carbon::parse($grant->starts_at, 'UTC')->format('Y-m-d\TH:i:s.u\Z'),
                    'ends_at' => $grant->ends_at === null ? null : Carbon::parse($grant->ends_at, 'UTC')->format('Y-m-d\TH:i:s.u\Z'),
                    'revoked_at' => null,
                ], $grants)]];
    }
}
