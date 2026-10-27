<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

if (getenv('YSP_SESSION_FIXTURES') !== '1' || ! preg_match('/^[1-9][0-9]*$/D', $argv[2] ?? '')) {
    exit(1);
}
require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$id = $argv[2];
$action = $argv[1];
if ($action === 'hold-organization') {
    DB::beginTransaction();
    DB::table('organizations')->where('id', $id)->lockForUpdate()->first();
    echo "held\n";
    fflush(STDOUT);
    fgets(STDIN);
    DB::rollBack();
    exit(0);
}
$input = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
if ($action === 'organization') {
    DB::table('organizations')->insert(['name' => 'Synthetic approved organization']);
    echo json_encode(['organization' => DB::connection()->getPdo()->lastInsertId()], JSON_THROW_ON_ERROR);
} elseif ($action === 'installed') {
    echo json_encode([
        'one_approved_installation' => DB::table('initial_provider_installations')->where('provider_user_id', $id)->count() === 1
            && DB::table('provider_role_grants')->where('user_id', $id)->where('role_code', 'provisioner')->count() === 1,
        'no_chapter_authority' => ! DB::table('memberships')->where('user_id', $id)->exists()
            && ! DB::table('chapters')->where('provisioned_by_user_id', $id)->exists(),
    ], JSON_THROW_ON_ERROR);
} elseif ($action === 'created') {
    $result = $input['result'];
    $attempt = DB::table('provider_operation_attempts')->where('provider_user_id', $id)->first();
    $operation = DB::table('provider_operations')->where('attempt_id', $attempt->id)->first();
    echo json_encode([
        'canonical_fingerprint_matches' => ! isset($input['expectedHash']) || hash_equals($input['expectedHash'], $attempt->payload_hash),
        'one_atomic_chapter' => DB::table('chapters')->where('provisioned_by_user_id', $id)->count() === 1,
        'one_provisioning' => DB::table('chapter_provisionings')->where('provider_user_id', $id)->count() === 1,
        'one_terminal_result' => $operation !== null && json_decode($operation->result_snapshot) == json_decode(json_encode($result, JSON_THROW_ON_ERROR)),
        'immutable_attribution' => DB::table('provider_actor_attributions')->where('attempt_id', $attempt->id)->count() === 1,
        'audit_retained' => DB::table('provider_audit_events')->where('operation_id', $operation->id)->count() === 1,
        'no_invented_follow_up' => ! DB::table('provider_follow_up_intents')->where('operation_id', $operation->id)->exists(),
        'no_operational_membership' => ! DB::table('memberships')->where('user_id', $id)->exists(),
    ], JSON_THROW_ON_ERROR);
} elseif ($action === 'advance-authority') {
    DB::table('provider_role_grants')->where('user_id', $id)->increment('authority_version');
    echo '{}';
} elseif ($action === 'attempt-count') {
    echo json_encode(['count' => DB::table('provider_operation_attempts')->where('provider_user_id', $id)->count()], JSON_THROW_ON_ERROR);
} elseif ($action === 'chapter-count') {
    echo json_encode(['count' => DB::table('chapters')->where('provisioned_by_user_id', $id)->count()], JSON_THROW_ON_ERROR);
} elseif ($action === 'ambiguous') {
    DB::table('organizations')->insert(['name' => 'Synthetic ambiguous scope']);
    $organization = DB::connection()->getPdo()->lastInsertId();
    DB::table('provider_role_grants')->insert([
        'organization_id' => $organization, 'user_id' => $id, 'role_code' => 'provisioner',
        'granted_by_user_id' => $id, 'starts_at' => now(), 'reason' => 'Synthetic deny fixture',
    ]);
    echo '{}';
} elseif ($action === 'revoke') {
    DB::table('provider_role_grants')->where('user_id', $id)->update(['revoked_at' => now()]);
    echo '{}';
} elseif ($action === 'immutable') {
    $assertions = [];
    foreach (['initial_provider_installations', 'provider_operation_attempts', 'provider_actor_attributions', 'provider_operations', 'provider_audit_events', 'provider_follow_up_intents'] as $table) {
        foreach (['UPDATE', 'DELETE'] as $mutation) {
            try {
                DB::statement($mutation === 'UPDATE' ? "UPDATE {$table} SET id = id WHERE 1 = 0" : "DELETE FROM {$table} WHERE 1 = 0");
                $assertions[$table.'_'.$mutation.'_denied'] = false;
            } catch (QueryException $error) {
                $assertions[$table.'_'.$mutation.'_denied'] = ($error->errorInfo[1] ?? 0) === 1142;
            }
        }
    }
    echo json_encode($assertions, JSON_THROW_ON_ERROR);
} elseif ($action === 'approved-same-organization') {
    DB::table('provider_role_grants')->where('user_id', $id)->update(['revoked_at' => now()]);
    DB::table('provider_role_grants')->insert([
        'organization_id' => $input['organization'], 'user_id' => $id, 'role_code' => 'provisioner',
        'granted_by_user_id' => $input['approver'], 'starts_at' => now(), 'reason' => 'Synthetic separately approved second provisioner',
    ]);
    echo '{}';
} else {
    exit(1);
}
