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
$input = json_decode($argv[1] === 'hold-context' ? fgets(STDIN) : stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
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
} elseif ($argv[1] === 'peer-membership') {
    $member = insertFixtureId('memberships', ['chapter_id' => $input['chapter_id'], 'user_id' => $user,
        'authorized_by_user_id' => $user, 'authorized_at' => now()]);
    insertFixtureId('duty_grants', ['chapter_id' => $input['chapter_id'], 'membership_id' => $member,
        'role_id' => DB::table('roles')->where('code', 'COMMITTEE_REQUESTER')->value('id'),
        'scope_kind' => 'chapter', 'starts_at' => now()->subMinute()]);
    $result = ['chapter_id' => $input['chapter_id'], 'membership_id' => $member];
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
} elseif (in_array($argv[1], ['execute', 'follow-up', 'hold-context'], true)) {
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
    $holdingContext = $argv[1] === 'hold-context';
    $effect = function () use ($marker, $input, $holdingContext, $user): JsonResponse {
        if ($holdingContext) {
            $execution = app(ProtectedChapterExecution::class);
            foreach ($execution->memberships($user) as $member) {
                $execution->grants($member);
            }
            echo "held\n";
            fflush(STDOUT);
            fgets(STDIN);
        }
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
        : $execution->execute($request, $effect, $input['scope'] ?? null);
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
            'code' => 'UINACT'.bin2hex(random_bytes(4)), 'name' => 'Synthetic test inactive unit', 'active' => false]);
        $inactiveUnit = (string) DB::connection()->getPdo()->lastInsertId();

        $futureUnit = insertFixtureId('requesting_units', ['chapter_id' => $member->chapter_id,
            'code' => 'UFUT'.bin2hex(random_bytes(4)), 'name' => 'Synthetic future unit', 'active' => true]);
        $duties = DB::table('roles')->orderBy('id')->pluck('id', 'code')->all();
        $matrix = [];
        foreach ($duties as $code => $roleId) {
            $finiteUnit = insertFixtureId('requesting_units', ['chapter_id' => $member->chapter_id,
                'code' => 'UFIN'.bin2hex(random_bytes(4)), 'name' => 'Synthetic finite-only duty unit', 'active' => true]);
            $dutyZeroUnit = insertFixtureId('requesting_units', ['chapter_id' => $member->chapter_id,
                'code' => 'UDZERO'.bin2hex(random_bytes(4)), 'name' => 'Synthetic zero-only duty unit', 'active' => true]);
            $insert = function (string $scope, ?string $unit, ?string $limit, mixed $starts, mixed $ends = null, mixed $revoked = null) use ($member, $roleId): string {
                return insertFixtureId('duty_grants', ['chapter_id' => $member->chapter_id, 'membership_id' => $member->id,
                    'role_id' => $roleId, 'scope_kind' => $scope, 'requesting_unit_id' => $unit,
                    'monetary_limit' => $limit, 'starts_at' => $starts, 'ends_at' => $ends, 'revoked_at' => $revoked]);
            };
            $matrix[$code] = [
                'finite_unit_id' => $finiteUnit,
                'zero_unit_id' => $dutyZeroUnit,
                'chapter_active' => $insert('chapter', null, null, now()->subMinute()),
                'unit_finite' => $insert('unit', $finiteUnit, '1500.00', now()->subMinute()),
                'unit_zero' => $insert('unit', $dutyZeroUnit, '0.00', now()->subMinute()),
                'future' => $insert('unit', $futureUnit, null, now()->addDay()),
                'expired' => $insert('chapter', null, null, now()->subDays(2), now()->subDay()),
                'revoked' => $insert('chapter', null, null, now()->subDays(2), now()->subMinute(), now()->subMinute()),
                'inactive_unit' => $insert('unit', $inactiveUnit, '500.00', now()->subMinute()),
            ];
        }
        $overlaps = DB::table('duty_grants as a')->join('duty_grants as b', function ($join): void {
            $join->on('a.membership_id', '=', 'b.membership_id')->on('a.role_id', '=', 'b.role_id')
                ->on('a.scope_kind', '=', 'b.scope_kind')->whereRaw('a.requesting_unit_id <=> b.requesting_unit_id')
                ->on('a.id', '<', 'b.id');
        })->where('a.membership_id', $member->id)->whereNull('a.revoked_at')->whereNull('b.revoked_at')
            ->where(fn ($q) => $q->whereNull('a.ends_at')->orWhereColumn('b.starts_at', '<', 'a.ends_at'))
            ->where(fn ($q) => $q->whereNull('b.ends_at')->orWhereColumn('a.starts_at', '<', 'b.ends_at'))->exists();
        if ($overlaps) {
            throw new RuntimeException('Overlapping synthetic duty authority.');
        }

        return [
            'active_unit_id' => $matrix['FINANCE']['finite_unit_id'],
            'zero_unit_id' => $matrix['FINANCE']['zero_unit_id'],
            'nonoverlapping' => true,
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
