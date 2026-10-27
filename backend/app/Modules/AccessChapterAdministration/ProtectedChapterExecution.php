<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use Closure;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class ProtectedChapterExecution
{
    public function __construct(private BrowserSessions $sessions, private SessionContract $contract) {}

    /** The owning operation supplies scope/action, never browser authority flags.
     * @param  Closure(array<string, mixed>, object): JsonResponse  $operation
     * @param  array<string, mixed>|null  $scope
     */
    public function execute(Request $request, Closure $operation, ?array $scope = null): JsonResponse
    {
        if ($scope !== null && ! preg_match('/^ctx_[A-Za-z0-9_-]{32,96}$/D', (string) $request->header('X-Chapter-Context'))) {
            return $this->contract->failure('ChapterQueryInvalid', 400);
        }
        try {
            return DB::transaction(function () use ($request, $operation, $scope): JsonResponse {
                $user = DB::table('users')->where('id', $request->session()->get('identity_id'))->lockForUpdate()->first();
                if ($user !== null) {
                    DB::table('provider_role_grants')->where('user_id', $user->id)->orderBy('id')->lockForUpdate()->get();
                    $memberships = DB::table('memberships')->where('user_id', $user->id)->orderBy('id')->lockForUpdate()->get();
                    DB::table('duty_grants')->whereIn('membership_id', $memberships->pluck('id'))->orderBy('id')->lockForUpdate()->get();
                }
                $session = $this->sessions->snapshot($request);
                if ($user === null || $user->disabled_at !== null || $session['state'] === 'signed_out') {
                    return $this->contract->failure('EnrollmentUnauthorized', 401);
                }
                if ($session['state'] !== 'authenticated') {
                    return $this->contract->failure('SessionForbidden', 403, 'forbidden');
                }
                $key = hash('sha256', $request->session()->getId());
                DB::table('chapter_selections')->insertOrIgnore(['session_key' => $key, 'user_id' => $user->id,
                    'membership_id' => null, 'revision' => 'ctx_'.bin2hex(random_bytes(32))]);
                $selection = DB::table('chapter_selections')->where('session_key', $key)->where('user_id', $user->id)->lockForUpdate()->first();
                if ($scope !== null && ($denied = $this->verifyScope($request, $selection, $scope)) !== null) {
                    return $denied;
                }
                $response = $operation($session, $selection);
                // Locks prevent concurrent authority changes; time can still cross an
                // expiry during the operation. Recheck immediately before commitment.
                $current = $this->sessions->snapshot($request);
                $live = DB::table('users')->where('id', $user->id)->lockForUpdate()->first();
                if ($live === null || $live->disabled_at !== null || $current['state'] === 'signed_out') {
                    throw new HttpResponseException($this->contract->failure('EnrollmentUnauthorized', 401));
                }
                if ($current['state'] !== 'authenticated') {
                    throw new HttpResponseException($this->contract->failure('SessionForbidden', 403, 'forbidden'));
                }
                if ($scope !== null && ($denied = $this->verifyScope($request, $selection, $scope)) !== null) {
                    throw new HttpResponseException($denied);
                }

                return $response;
            }, 3);
        } catch (HttpResponseException $denied) {
            /** @var JsonResponse */
            return $denied->getResponse();
        }
    }

    /** @param array<string, mixed> $scope */
    private function verifyScope(Request $request, object $selection, array $scope): ?JsonResponse
    {
        if (($stale = $this->verifyRevision($request, $selection)) !== null) {
            return $stale;
        }
        $member = DB::table('memberships')->where('id', $selection->membership_id)->where('user_id', $selection->user_id)
            ->where('status', 'active')->whereNull('disabled_at')->lockForUpdate()->first();
        if ($member === null || (string) $member->chapter_id !== ($scope['chapter_id'] ?? null)
            || (string) $member->id !== ($scope['membership_id'] ?? null)) {
            return $this->stale();
        }
        $guard = DB::table('chapter_control_guards')->where('chapter_id', $member->chapter_id)->lockForUpdate()->first();
        if ($guard === null || $guard->authority_version !== ($scope['expected_authority_version'] ?? null)) {
            return $this->stale();
        }
        $unit = $scope['requesting_unit_id'] ?? null;
        if ($unit !== null && (! InitialHeadApproval::validId($unit) || ! DB::table('requesting_units')
            ->where('id', $unit)->where('chapter_id', $member->chapter_id)->where('active', true)->lockForUpdate()->exists())) {
            return $this->contract->failure('SessionForbidden', 403, 'forbidden');
        }
        foreach ($this->grants($member) as $grant) {
            if (! in_array($scope['action'] ?? null, $this->actions([$grant], $unit), true)) {
                continue;
            }
            if (array_key_exists('amount', $scope) && ! $this->withinLimit($scope['amount'], $grant->monetary_limit)) {
                continue;
            }

            return null;
        }

        return $this->contract->failure('SessionForbidden', 403, 'forbidden');
    }

    private function withinLimit(mixed $amount, ?string $limit): bool
    {
        if ($limit === null || ! is_string($amount) || ! preg_match('/^(0|[1-9][0-9]{0,16})\.[0-9]{2}$/D', $amount)) {
            return false;
        }
        $value = ltrim(str_replace('.', '', $amount), '0');
        $cap = ltrim(str_replace('.', '', $limit), '0');

        return strlen($value) < strlen($cap) || (strlen($value) === strlen($cap) && strcmp($value, $cap) <= 0);
    }

    /** @param list<object> $grants
     * @return list<string>
     */
    public function actions(array $grants, ?string $unit = null): array
    {
        $duties = [];
        foreach ($grants as $grant) {
            if ($grant->scope_kind === 'chapter' || ($unit !== null && (string) $grant->requesting_unit_id === $unit)) {
                $duties[] = $grant->duty_code;
            }
        }
        $actions = [];
        foreach ($this->contract->metadata()['actions'] as $row) {
            if ($row['enabled_boundary'] && array_intersect($duties, $row['chapter_duties']) !== []) {
                $actions[] = $row['action'];
            }
        }

        return $actions;
    }

    public function rotate(object $selection, ?string $membership): void
    {
        $selection->revision = 'ctx_'.bin2hex(random_bytes(32));
        $selection->membership_id = $membership;
        DB::table('chapter_selections')->where('session_key', $selection->session_key)->update([
            'revision' => $selection->revision, 'membership_id' => $membership,
        ]);
    }

    public function stale(): JsonResponse
    {
        return response()->json(['code' => 'chapter_context_stale',
            'message' => 'Refresh current context and review the original scope before another attempt.', 'next_action' => 'refresh_context'], 409);
    }

    public function verifyRevision(Request $request, object $selection): ?JsonResponse
    {
        return hash_equals($selection->revision, (string) $request->header('X-Chapter-Context')) ? null : $this->stale();
    }

    /** @return list<object> */
    public function memberships(string $user, ?string $after = null, ?int $limit = null): array
    {
        $query = DB::table('memberships')->join('chapters', 'chapters.id', '=', 'memberships.chapter_id')
            ->where('memberships.user_id', $user)->where('memberships.status', 'active')->whereNull('memberships.disabled_at')
            ->select('memberships.*', 'chapters.name as chapter_name')->orderBy('memberships.chapter_id')->orderBy('memberships.id')
            ->lockForUpdate();
        if ($after !== null) {
            $query->where('memberships.chapter_id', '>', $after);
        }
        if ($limit !== null) {
            $query->limit($limit);
        }

        return $query->get()->all();
    }

    /** @return list<object> */
    public function grants(object $membership): array
    {
        return DB::table('duty_grants')->join('roles', 'roles.id', '=', 'duty_grants.role_id')
            ->leftJoin('requesting_units', function ($join): void {
                $join->on('requesting_units.id', '=', 'duty_grants.requesting_unit_id')->on('requesting_units.chapter_id', '=', 'duty_grants.chapter_id');
            })
            ->where('membership_id', $membership->id)->where('duty_grants.chapter_id', $membership->chapter_id)
            ->where(fn ($query) => $query->where('scope_kind', 'chapter')->orWhere('requesting_units.active', true))
            ->whereNull('revoked_at')->where('starts_at', '<=', now())
            ->where(fn ($query) => $query->whereNull('ends_at')->orWhere('ends_at', '>', now()))
            ->select('duty_grants.*', 'roles.code as duty_code')->orderBy('duty_grants.id')->lockForUpdate()->get()->all();
    }
}
