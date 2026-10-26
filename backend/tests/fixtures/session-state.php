<?php

declare(strict_types=1);
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

// Synthetic setup only: no HTTP routes or production commands expose this seam.
if (getenv('YSP_SESSION_FIXTURES') !== '1') {
    exit(1);
}
require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$id = $argv[2] ?? '';
if (! preg_match('/^[1-9][0-9]*$/', $id)) {
    exit(1);
}
$expire = static function (string $kind) use ($id): void {
    foreach (DB::table('sessions')->get() as $row) {
        $payload = json_decode(base64_decode($row->payload), true, flags: JSON_THROW_ON_ERROR);
        if (($payload['identity_id'] ?? null) !== $id) {
            continue;
        }
        if ($kind === 'absolute-expired') {
            $payload['signed_in_at'] = time() - 28800;
        }
        DB::table('sessions')->where('id', $row->id)->update([
            'payload' => base64_encode(json_encode($payload, JSON_THROW_ON_ERROR)),
            'last_activity' => $kind === 'idle-expired' ? time() - 1801 : time(),
        ]);
    }
};
$provider = static function () use ($id): void {
    $organization = DB::table('organizations')->insertGetId(['name' => 'Synthetic organization']);
    DB::table('provider_role_grants')->insert([
        'organization_id' => $organization, 'user_id' => $id, 'role_code' => 'provisioner',
        'granted_by_user_id' => $id, 'starts_at' => now()->subMinute(), 'reason' => 'Synthetic test approval',
    ]);
};
$duty = static function (string $role) use ($id): void {
    $db = DB::class;
    $organization = $db::table('organizations')->insertGetId(['name' => 'Synthetic organization']);
    $chapter = $db::table('chapters')->insertGetId([
        'organization_id' => $organization, 'code' => 'TEST-'.bin2hex(random_bytes(8)),
        'name' => 'Synthetic chapter', 'provisioned_by_user_id' => $id,
    ]);
    $membership = $db::table('memberships')->insertGetId([
        'chapter_id' => $chapter, 'user_id' => $id, 'authorized_by_user_id' => $id, 'authorized_at' => now(),
    ]);
    $db::table('duty_grants')->insert([
        'chapter_id' => $chapter, 'membership_id' => $membership,
        'role_id' => $db::table('roles')->where('code', $role)->value('id'),
        'scope_kind' => 'chapter', 'starts_at' => now()->subMinute(),
    ]);
};
match ($argv[1] ?? '') {
    'disable' => DB::table('users')->where('id', $id)->update(['status' => 'disabled']),
    'auth-version' => DB::table('users')->where('id', $id)->increment('auth_version'),
    'absolute-expired', 'idle-expired' => $expire($argv[1]),
    'provider' => $provider(),
    'requester' => $duty('COMMITTEE_REQUESTER'),
    'head' => $duty('CHAPTER_HEAD'),
    'confirmed-factor' => DB::table('users')->where('id', $id)->update([
        'mfa_confirmed_at' => now(), 'mfa_secret_ciphertext' => encrypt('Synthetic-test-factor'),
    ]),
    'clear-throttles' => DB::table('session_throttles')->delete(),
    'expire-throttles' => DB::table('session_throttles')->update(['expires_at' => time() - 1]),
    default => throw new RuntimeException('Unknown fixture'),
};
echo 'Fixture applied';
