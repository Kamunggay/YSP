<?php

declare(strict_types=1);

use App\Modules\AccessChapterAdministration\ProtectedChapterExecution;
use Carbon\Carbon;
use Illuminate\Contracts\Console\Kernel;
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
$user = $argv[2];
$input = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
if ($argv[1] === 'membership') {
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
} elseif ($argv[1] === 'execute') {
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
    $response = app(ProtectedChapterExecution::class)->execute($request, function () use ($marker, $input): JsonResponse {
        DB::table('session_throttles')->insert(['key' => $marker, 'attempts' => 1, 'expires_at' => time() + 60]);
        if (isset($input['wait_until'])) {
            while (now()->lt(Carbon::parse($input['wait_until'], 'UTC'))) {
                usleep(10000);
            }
        }

        return response()->json(['executed' => true]);
    }, $input['scope']);
    $result = ['status' => $response->getStatusCode(), 'body' => $response->getData(true),
        'effect_committed' => DB::table('session_throttles')->where('key', $marker)->exists()];
} elseif ($argv[1] === 'grant') {
    $result = DB::transaction(function () use ($user, $input): array {
        DB::table('users')->where('id', $user)->lockForUpdate()->first();
        $member = DB::table('memberships')->where('id', $input['membership_id'])->where('user_id', $user)->lockForUpdate()->first();
        $unit = null;
        if ($input['unit'] ?? false) {
            DB::table('requesting_units')->insert(['chapter_id' => $member->chapter_id,
                'code' => 'U'.bin2hex(random_bytes(6)), 'name' => 'Synthetic unit', 'active' => $input['active'] ?? true]);
            $unit = DB::connection()->getPdo()->lastInsertId();
        }
        $ends = isset($input['ttl_ms']) ? now()->addMilliseconds($input['ttl_ms']) : ($input['ends_at'] ?? null);
        DB::table('duty_grants')->insert(['chapter_id' => $member->chapter_id, 'membership_id' => $member->id,
            'role_id' => DB::table('roles')->where('code', $input['duty'] ?? 'COMMITTEE_REQUESTER')->value('id'),
            'scope_kind' => $unit === null ? 'chapter' : 'unit', 'requesting_unit_id' => $unit,
            'monetary_limit' => $input['limit'] ?? null, 'starts_at' => $input['starts_at'] ?? now()->subMinute(),
            'ends_at' => $ends, 'revoked_at' => $input['revoked_at'] ?? null]);
        $grant = DB::connection()->getPdo()->lastInsertId();

        return ['grant_id' => (string) $grant, 'requesting_unit_id' => $unit === null ? null : (string) $unit,
            'ends_at' => $ends === null ? null : Carbon::parse($ends, 'UTC')->format('Y-m-d\TH:i:s.u\Z')];
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
