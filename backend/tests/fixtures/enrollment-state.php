<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

// Restricted integration seam. Secrets arrive on stdin; output contains only assertions.
if (getenv('YSP_SESSION_FIXTURES') !== '1' || ! preg_match('/^[1-9][0-9]*$/D', $argv[2] ?? '')) {
    exit(1);
}
require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$id = $argv[2];
$action = $argv[1];
if ($action === 'hold') {
    DB::beginTransaction();
    DB::table('users')->where('id', $id)->lockForUpdate()->first();
    echo "held\n";
    fflush(STDOUT);
    fgets(STDIN);
    DB::rollBack();
    exit(0);
}
if ($action === 'expire') {
    DB::table('authenticator_enrollments')->where('user_id', $id)->update([
        'created_at' => now()->subMinutes(11), 'expires_at' => now()->subMinute(),
    ]);
    echo '{}';
    exit(0);
}
if ($action === 'expire-lockout') {
    DB::table('authenticator_enrollments')->where('user_id', $id)->update([
        'attempt_window_expires_at' => now()->subMinute(),
    ]);
    echo '{}';
    exit(0);
}
$input = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
$enrollment = DB::table('authenticator_enrollments')->where('user_id', $id)->first();
$user = DB::table('users')->where('id', $id)->first();
if ($action === 'failed-attempts') {
    echo json_encode([
        'attempts_match' => (int) ($enrollment->failed_attempts ?? 0) === (int) $input['expected_attempts'],
    ], JSON_THROW_ON_ERROR);
    exit(0);
}
if ($action === 'confirmed-state') {
    $events = DB::table('global_security_events')->where('user_id', $id)->get();
    $verifiers = DB::table('user_recovery_codes')->where('user_id', $id)->pluck('code_hash')->all();
    echo json_encode([
        'mfa_confirmed' => $user->mfa_confirmed_at !== null && $user->mfa_secret_ciphertext !== null,
        'mfa_unchanged' => empty($input['confirmed_at']) || $user->mfa_confirmed_at === $input['confirmed_at'],
        'consumed' => $enrollment !== null && $enrollment->consumed_at !== null && $enrollment->secret_ciphertext === null,
        'recovery_count_is_ten' => count($verifiers) === 10,
        'all_verifiers_hashed' => count($verifiers) === 10 && array_reduce($verifiers, fn (bool $carry, string $v): bool => $carry && strlen($v) === 32, true),
        'one_issuance_event' => $events->where('event_code', 'authenticator_confirmed')->count() === 1,
        'no_secrets_in_events' => empty($input['secret']) || ! str_contains(json_encode($events), (string) $input['secret']),
    ], JSON_THROW_ON_ERROR);
    exit(0);
}
if ($action === 'prepared') {
    echo json_encode([
        'encrypted' => $enrollment->secret_ciphertext !== $input['secret']
            && Crypt::decryptString($enrollment->secret_ciphertext) === $input['secret'],
        'identity_bound' => (string) $enrollment->user_id === $id,
        'session_hashed' => (bool) preg_match('/^[a-f0-9]{64}$/D', $enrollment->session_binding),
        'unconfirmed' => $user->mfa_confirmed_at === null && $user->mfa_secret_ciphertext === null,
        'no_recovery_codes' => ! DB::table('user_recovery_codes')->where('user_id', $id)->exists(),
    ], JSON_THROW_ON_ERROR);
    exit(0);
}
$verifiers = DB::table('user_recovery_codes')->where('user_id', $id)->pluck('code_hash')->all();
$hashes = array_map(fn (string $code): string => hash('sha256', $code, true), $input['codes']);
sort($hashes);
sort($verifiers);
echo json_encode([
    'encrypted' => $user->mfa_secret_ciphertext !== $input['secret']
        && Crypt::decryptString($user->mfa_secret_ciphertext) === $input['secret'],
    'consumed' => $enrollment->consumed_at !== null && $enrollment->secret_ciphertext === null,
    'individual_verifiers' => count($verifiers) === 10 && $hashes === $verifiers,
    'one_issuance_event' => DB::table('global_security_events')->where('user_id', $id)
        ->where('event_code', 'authenticator_confirmed')->count() === 1,
    'no_secret_readback' => ! str_contains(json_encode(DB::table('global_security_events')->where('user_id', $id)->get()), $input['secret']),
], JSON_THROW_ON_ERROR);
