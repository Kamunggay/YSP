<?php

declare(strict_types=1);

use App\Modules\AccessChapterAdministration\ProtectedChapterExecution;
use Carbon\Carbon;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// Synthetic authorization arrangements only; this is not a live approval path.
if (getenv('YSP_SESSION_FIXTURES') !== '1' || ! preg_match('/^[1-9][0-9]*$/D', $argv[2] ?? '')) {
    exit(1);
}
require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
require __DIR__.'/fixture-support.php';
installFixtureFailureHandler();
$user = $argv[2];
$input = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
if ($argv[1] === 'grant-approval-security') {
    $approval = DB::table('duty_grant_limit_approvals')->where('chapter_id', $input['chapter_id'])->first();
    if ($approval === null) {
        throw new RuntimeException('Missing synthetic approval.');
    }
    $result = [];
    foreach (['insert', 'update', 'delete'] as $mutation) {
        DB::beginTransaction();
        try {
            if ($mutation === 'insert') {
                $copy = (array) $approval;
                unset($copy['id']);
                DB::table('duty_grant_limit_approvals')->insert($copy);
            } elseif ($mutation === 'update') {
                DB::table('duty_grant_limit_approvals')->where('id', $approval->id)->update(['monetary_limit' => '9999.00']);
            } else {
                DB::table('duty_grant_limit_approvals')->where('id', $approval->id)->delete();
            }
            $result[$mutation.'_denied'] = false;
        } catch (QueryException $error) {
            $result[$mutation.'_denied'] = in_array($error->errorInfo[1] ?? null, [1142, 1644], true);
        } finally {
            DB::rollBack();
        }
    }
} elseif ($argv[1] === 'membership-versions') {
    DB::table('memberships')->where('id', $input['membership_id'])->where('user_id', $user)->update([
        'row_version' => $input['row_version'], 'authority_version' => $input['authority_version']]);
    $result = ['applied' => true];
} elseif ($argv[1] === 'chapter-history-security') {
    $result = [];
    foreach (['UPDATE', 'DELETE'] as $mutation) {
        try {
            DB::statement($mutation === 'UPDATE' ? 'UPDATE chapter_operations SET id = id WHERE 1 = 0' : 'DELETE FROM chapter_operations WHERE 1 = 0');
            $result[$mutation.'_denied'] = false;
        } catch (QueryException $error) {
            $result[$mutation.'_denied'] = ($error->errorInfo[1] ?? 0) === 1142;
        }
    }
} elseif ($argv[1] === 'membership-candidate') {
    DB::table('membership_candidates')->insert(['chapter_id' => $input['chapter_id'], 'user_id' => $user,
        'purpose' => 'membership_authorization', 'approved_by_user_id' => $input['approved_by_user_id'],
        'executed_by_user_id' => $user, 'operator_reference' => 'Synthetic operator',
        'approval_reference' => 'Synthetic independent approval', 'authorized_at' => now()]);
    $result = ['authorized' => true];
} elseif ($argv[1] === 'membership') {
    $result = DB::transaction(function () use ($user, $input): array {
        DB::table('users')->where('id', $user)->lockForUpdate()->first();
        DB::table('organizations')->insert(['name' => 'Synthetic context organization']);
        $organization = DB::connection()->getPdo()->lastInsertId();
        $chapterData = ['organization_id' => $organization,
            'code' => 'CTX'.bin2hex(random_bytes(8)), 'name' => 'Synthetic authorized chapter', 'provisioned_by_user_id' => $user];
        if (isset($input['chapter_id'])) {
            $chapter = $input['chapter_id'];
            DB::table('chapters')->insert(['id' => $chapter] + $chapterData);
        } else {
            DB::table('chapters')->insert($chapterData);
            $chapter = DB::connection()->getPdo()->lastInsertId();
        }
        DB::table('chapter_control_guards')->insert(['chapter_id' => $chapter]);
        DB::table('memberships')->insert(['chapter_id' => $chapter, 'user_id' => $user,
            'authorized_by_user_id' => $user, 'authorized_at' => now()]);
        $member = DB::connection()->getPdo()->lastInsertId();
        foreach ($input['duties'] ?? ['COMMITTEE_REQUESTER'] as $duty) {
            DB::table('duty_grants')->insert(['chapter_id' => $chapter, 'membership_id' => $member,
                'role_id' => DB::table('roles')->where('code', $duty)->value('id'), 'scope_kind' => 'chapter', 'starts_at' => now()->subMinute()]);
        }

        return ['chapter_id' => (string) $chapter, 'membership_id' => (string) $member, 'expected_membership_version' => 1];
    });
} elseif (in_array($argv[1], ['execute', 'follow-up'], true)) {
    $session = app('session')->driver();
    foreach (DB::table('sessions')->get() as $row) {
        $payload = json_decode(base64_decode($row->payload), true, flags: JSON_THROW_ON_ERROR);
        if (($payload['identity_id'] ?? null) === $user) {
            $session->setId($row->id);
            $session->start();
            break;
        }
    }
    $request = Request::create('/synthetic-protected-consumer', 'POST');
    $request->setLaravelSession($session);
    $request->headers->set('X-Chapter-Context', $input['revision']);
    $marker = hash('sha256', random_bytes(32));
    $effect = function () use ($marker, $input): JsonResponse {
        DB::table('session_throttles')->insert(['key' => $marker, 'attempts' => 1, 'expires_at' => time() + 60]);
        if (isset($input['wait_until'])) {
            while (now()->lt(Carbon::parse($input['wait_until'], 'UTC'))) {
                usleep(10000);
            }
        }

        return response()->json(['executed' => true]);
    };
    $execution = app(ProtectedChapterExecution::class);
    $response = $argv[1] === 'follow-up'
        ? $execution->withCurrentAccess($request, $input['scope']['chapter_id'], $input['scope']['action'], $effect)
        : $execution->execute($request, $effect, $input['scope']);
    $result = ['status' => $response->getStatusCode(), 'body' => $response->getData(true),
        'effect_committed' => DB::table('session_throttles')->where('key', $marker)->exists()];
} elseif ($argv[1] === 'grant') {
    $result = DB::transaction(function () use ($user, $input): array {
        DB::table('users')->where('id', $user)->lockForUpdate()->first();
        $member = DB::table('memberships')->where('id', $input['membership_id'])->where('user_id', $user)->lockForUpdate()->first();
        $unit = $input['requesting_unit_id'] ?? null;
        if ($unit === null && ($input['unit'] ?? false)) {
            DB::table('requesting_units')->insert(['chapter_id' => $member->chapter_id,
                'code' => 'U'.bin2hex(random_bytes(6)), 'name' => 'Synthetic unit', 'active' => $input['active'] ?? true]);
            $unit = DB::connection()->getPdo()->lastInsertId();
        }
        $ends = isset($input['ttl_ms']) ? now()->addMilliseconds($input['ttl_ms']) : ($input['ends_at'] ?? null);
        $scopeKind = $input['scope_kind'] ?? ($unit === null ? 'chapter' : 'unit');
        DB::table('duty_grants')->insert(['chapter_id' => $member->chapter_id, 'membership_id' => $member->id,
            'role_id' => DB::table('roles')->where('code', $input['duty'] ?? 'COMMITTEE_REQUESTER')->value('id'),
            'scope_kind' => $scopeKind, 'requesting_unit_id' => $unit,
            'monetary_limit' => $input['limit'] ?? null, 'starts_at' => $input['starts_at'] ?? now()->subMinute(),
            'ends_at' => $ends, 'revoked_at' => $input['revoked_at'] ?? null]);
        $grant = DB::connection()->getPdo()->lastInsertId();

        return ['grant_id' => (string) $grant, 'requesting_unit_id' => $unit === null ? null : (string) $unit,
            'ends_at' => $ends === null ? null : Carbon::parse($ends, 'UTC')->format('Y-m-d\TH:i:s.u\Z')];
    });
} elseif ($argv[1] === 'unit') {
    $result = DB::transaction(function () use ($user, $input): array {
        DB::table('users')->where('id', $user)->lockForUpdate()->first();
        DB::table('requesting_units')->insert([
            'chapter_id' => $input['chapter_id'],
            'code' => 'U'.bin2hex(random_bytes(6)),
            'name' => 'Synthetic test unit',
            'active' => $input['active'] ?? true,
        ]);
        $unit = DB::connection()->getPdo()->lastInsertId();

        return ['requesting_unit_id' => (string) $unit];
    });
} elseif ($argv[1] === 'revoke-grant') {
    DB::transaction(function () use ($user, $input): void {
        DB::table('users')->where('id', $user)->lockForUpdate()->first();
        DB::table('duty_grants')->where('id', $input['grant_id'])
            ->update(['revoked_at' => $input['revoked_at'] ?? now()]);
    });
    $result = ['applied' => true];
} elseif ($argv[1] === 'expire-grant') {
    DB::transaction(function () use ($user, $input): void {
        DB::table('users')->where('id', $user)->lockForUpdate()->first();
        DB::table('duty_grants')->where('id', $input['grant_id'])
            ->update(['ends_at' => $input['ends_at'] ?? now()->subSecond()]);
    });
    $result = ['applied' => true];
} elseif ($argv[1] === 'deactivate-unit') {
    DB::transaction(function () use ($user, $input): void {
        DB::table('users')->where('id', $user)->lockForUpdate()->first();
        DB::table('requesting_units')->where('id', $input['requesting_unit_id'])
            ->update(['active' => false]);
    });
    $result = ['applied' => true];
} elseif ($argv[1] === 'duties-matrix') {
    $result = DB::transaction(function () use ($user, $input): array {
        DB::table('users')->where('id', $user)->lockForUpdate()->first();
        $member = DB::table('memberships')->where('id', $input['membership_id'])->where('user_id', $user)->lockForUpdate()->first();
        DB::table('requesting_units')->insert(['chapter_id' => $member->chapter_id,
            'code' => 'UACT'.bin2hex(random_bytes(4)), 'name' => 'Synthetic test active unit', 'active' => true]);
        $activeUnit = (string) DB::connection()->getPdo()->lastInsertId();

        DB::table('requesting_units')->insert(['chapter_id' => $member->chapter_id,
            'code' => 'UINACT'.bin2hex(random_bytes(4)), 'name' => 'Synthetic test inactive unit', 'active' => false]);
        $inactiveUnit = (string) DB::connection()->getPdo()->lastInsertId();

        $duties = DB::table('roles')->orderBy('id')->pluck('id', 'code')->all();
        $matrix = [];
        foreach ($duties as $code => $roleId) {
            DB::table('duty_grants')->insert(['chapter_id' => $member->chapter_id, 'membership_id' => $member->id,
                'role_id' => $roleId, 'scope_kind' => 'chapter', 'requesting_unit_id' => null,
                'monetary_limit' => null, 'starts_at' => now()->subMinute(), 'ends_at' => null, 'revoked_at' => null]);
            $chGrant = (string) DB::connection()->getPdo()->lastInsertId();

            DB::table('duty_grants')->insert(['chapter_id' => $member->chapter_id, 'membership_id' => $member->id,
                'role_id' => $roleId, 'scope_kind' => 'unit', 'requesting_unit_id' => $activeUnit,
                'monetary_limit' => '1500.00', 'starts_at' => now()->subMinute(), 'ends_at' => null, 'revoked_at' => null]);
            $unitFiniteGrant = (string) DB::connection()->getPdo()->lastInsertId();

            DB::table('duty_grants')->insert(['chapter_id' => $member->chapter_id, 'membership_id' => $member->id,
                'role_id' => $roleId, 'scope_kind' => 'unit', 'requesting_unit_id' => $activeUnit,
                'monetary_limit' => '0.00', 'starts_at' => now()->subMinute(), 'ends_at' => null, 'revoked_at' => null]);
            $unitZeroGrant = (string) DB::connection()->getPdo()->lastInsertId();

            DB::table('duty_grants')->insert(['chapter_id' => $member->chapter_id, 'membership_id' => $member->id,
                'role_id' => $roleId, 'scope_kind' => 'chapter', 'requesting_unit_id' => null,
                'monetary_limit' => null, 'starts_at' => now()->addDay(), 'ends_at' => null, 'revoked_at' => null]);
            $futureGrant = (string) DB::connection()->getPdo()->lastInsertId();

            DB::table('duty_grants')->insert(['chapter_id' => $member->chapter_id, 'membership_id' => $member->id,
                'role_id' => $roleId, 'scope_kind' => 'chapter', 'requesting_unit_id' => null,
                'monetary_limit' => null, 'starts_at' => now()->subDays(2), 'ends_at' => now()->subDay(), 'revoked_at' => null]);
            $expiredGrant = (string) DB::connection()->getPdo()->lastInsertId();

            DB::table('duty_grants')->insert(['chapter_id' => $member->chapter_id, 'membership_id' => $member->id,
                'role_id' => $roleId, 'scope_kind' => 'chapter', 'requesting_unit_id' => null,
                'monetary_limit' => null, 'starts_at' => now()->subDays(2), 'ends_at' => null, 'revoked_at' => now()->subDay()]);
            $revokedGrant = (string) DB::connection()->getPdo()->lastInsertId();

            DB::table('duty_grants')->insert(['chapter_id' => $member->chapter_id, 'membership_id' => $member->id,
                'role_id' => $roleId, 'scope_kind' => 'unit', 'requesting_unit_id' => $inactiveUnit,
                'monetary_limit' => '500.00', 'starts_at' => now()->subMinute(), 'ends_at' => null, 'revoked_at' => null]);
            $inactiveUnitGrant = (string) DB::connection()->getPdo()->lastInsertId();

            $matrix[$code] = [
                'chapter_active' => $chGrant,
                'unit_finite' => $unitFiniteGrant,
                'unit_zero' => $unitZeroGrant,
                'future' => $futureGrant,
                'expired' => $expiredGrant,
                'revoked' => $revokedGrant,
                'inactive_unit' => $inactiveUnitGrant,
            ];
        }

        return [
            'active_unit_id' => $activeUnit,
            'inactive_unit_id' => $inactiveUnit,
            'matrix' => $matrix,
        ];
    });
} elseif ($argv[1] === 'end-membership') {
    DB::transaction(function () use ($user, $input): void {
        DB::table('users')->where('id', $user)->lockForUpdate()->first();
        DB::table('memberships')->where('id', $input['membership_id'])->where('user_id', $user)
            ->update(['status' => 'revoked', 'authority_version' => DB::raw('authority_version + 1')]);
    });
    $result = ['applied' => true];
} else {
    throw new RuntimeException('Unknown synthetic context fixture.');
}
echo json_encode($result, JSON_THROW_ON_ERROR);
