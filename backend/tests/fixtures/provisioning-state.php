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
if ($action === 'hold-candidate-revocation') {
    DB::beginTransaction();
    DB::table('initial_head_candidates')->where('user_id', $id)->update(['revoked_at' => now()]);
    echo "held\n";
    fflush(STDOUT);
    fgets(STDIN);
    DB::commit();
    exit(0);
}
$input = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
if ($action === 'head-history-privileges') {
    $checks = [];
    foreach (['initial_head_designations', 'initial_head_bootstraps'] as $table) {
        foreach (['UPDATE', 'DELETE'] as $mutation) {
            try {
                DB::statement($mutation === 'UPDATE' ? "UPDATE {$table} SET id = id WHERE 1 = 0" : "DELETE FROM {$table} WHERE 1 = 0");
                $checks[$table.'_'.$mutation.'_denied'] = false;
            } catch (QueryException $error) {
                $checks[$table.'_'.$mutation.'_denied'] = ($error->errorInfo[1] ?? 0) === 1142;
            }
        }
    }
    echo json_encode($checks, JSON_THROW_ON_ERROR);
} elseif ($action === 'cross-chapter-constraints') {
    $results = [];
    $chA = $input['chapter_a'];
    $chB = $input['chapter_b'];

    $provA = DB::table('chapter_provisionings')->where('chapter_id', $chA)->value('id');
    $provB = DB::table('chapter_provisionings')->where('chapter_id', $chB)->value('id');
    $orgA = DB::table('chapters')->where('id', $chA)->value('organization_id');
    $orgB = DB::table('chapters')->where('id', $chB)->value('organization_id');

    $approvedBy = $input['approved_by'] ?? $id;
    $executedBy = $input['executed_by'] ?? $id;

    DB::beginTransaction();
    try {
        $opPublicId1 = '01K8A6J0A00000000000000099';
        $opPublicIdA = '01K8A6J0A00000000000000098';
        $opPublicIdB = '01K8A6J0A00000000000000097';
        $time = now()->format('Y-m-d H:i:s.u');

        DB::table('provider_operation_attempts')->insert([
            ['public_id' => $opPublicId1, 'organization_id' => $orgB, 'provider_user_id' => $id,
                'action_code' => 'provider.initial_head.appoint', 'idempotency_key' => 'cross-op1-'.uniqid(),
                'payload_hash' => str_repeat('1', 64), 'input_schema' => 'AppointInitialHeadRequest@p02.09-review.1',
                'created_at' => $time],
            ['public_id' => $opPublicIdA, 'organization_id' => $orgA, 'provider_user_id' => $id,
                'action_code' => 'provider.initial_head.appoint', 'idempotency_key' => 'cross-opA-'.uniqid(),
                'payload_hash' => str_repeat('2', 64), 'input_schema' => 'AppointInitialHeadRequest@p02.09-review.1',
                'created_at' => $time],
            ['public_id' => $opPublicIdB, 'organization_id' => $orgB, 'provider_user_id' => $id,
                'action_code' => 'provider.initial_head.appoint', 'idempotency_key' => 'cross-opB-'.uniqid(),
                'payload_hash' => str_repeat('3', 64), 'input_schema' => 'AppointInitialHeadRequest@p02.09-review.1',
                'created_at' => $time],
        ]);

        // 1. Cross-chapter designation: chapter_b with provisioning_a
        try {
            DB::table('initial_head_designations')->insert([
                'provisioning_id' => $provA,
                'chapter_id' => $chB,
                'user_id' => $id,
                'operation_public_id' => $opPublicId1,
                'appointment_snapshot' => '{}',
                'reason' => 'Cross-chapter test',
                'appointed_at' => $time,
            ]);
            $results['cross_chapter_designation_provisioning_rejected'] = false;
        } catch (QueryException $error) {
            $results['cross_chapter_designation_provisioning_rejected'] = ($error->errorInfo[1] ?? 0) === 1452;
        }

        // Create valid designation, membership, and duty grant for chapter_a
        DB::table('initial_head_designations')->insert([
            'provisioning_id' => $provA,
            'chapter_id' => $chA,
            'user_id' => $id,
            'operation_public_id' => $opPublicIdA,
            'appointment_snapshot' => '{}',
            'reason' => 'Valid designation A for FK test',
            'appointed_at' => $time,
        ]);
        $desA = DB::connection()->getPdo()->lastInsertId();

        $headRole = DB::table('roles')->where('code', 'CHAPTER_HEAD')->first();
        DB::table('memberships')->insert([
            'chapter_id' => $chA,
            'user_id' => $id,
            'status' => 'active',
            'authorized_by_user_id' => $approvedBy,
            'authorized_at' => $time,
        ]);
        $memA = DB::connection()->getPdo()->lastInsertId();

        DB::table('duty_grants')->insert([
            'chapter_id' => $chA,
            'membership_id' => $memA,
            'role_id' => $headRole->id,
            'scope_kind' => 'chapter',
            'requesting_unit_id' => null,
            'monetary_limit' => null,
            'starts_at' => $time,
        ]);
        $grantA = DB::connection()->getPdo()->lastInsertId();

        // Create valid designation, membership, and duty grant for chapter_b
        DB::table('initial_head_designations')->insert([
            'provisioning_id' => $provB,
            'chapter_id' => $chB,
            'user_id' => $id,
            'operation_public_id' => $opPublicIdB,
            'appointment_snapshot' => '{}',
            'reason' => 'Valid designation B for FK test',
            'appointed_at' => $time,
        ]);
        $desB = DB::connection()->getPdo()->lastInsertId();

        DB::table('memberships')->insert([
            'chapter_id' => $chB,
            'user_id' => $id,
            'status' => 'active',
            'authorized_by_user_id' => $approvedBy,
            'authorized_at' => $time,
        ]);
        $memB = DB::connection()->getPdo()->lastInsertId();

        DB::table('duty_grants')->insert([
            'chapter_id' => $chB,
            'membership_id' => $memB,
            'role_id' => $headRole->id,
            'scope_kind' => 'chapter',
            'requesting_unit_id' => null,
            'monetary_limit' => null,
            'starts_at' => $time,
        ]);
        $grantB = DB::connection()->getPdo()->lastInsertId();

        // 2. Cross-chapter bootstrap: chapter_b with designation_a
        try {
            DB::table('initial_head_bootstraps')->insert([
                'chapter_id' => $chB,
                'designation_id' => $desA,
                'membership_id' => $memB,
                'duty_grant_id' => $grantB,
                'approved_by_user_id' => $approvedBy,
                'executed_by_user_id' => $executedBy,
                'operator_reference' => 'Cross-chapter test',
                'approval_reference' => 'Cross-chapter test',
                'payload_hash' => str_repeat('a', 64),
                'approval_snapshot' => '{}',
                'result_snapshot' => '{}',
                'installed_at' => $time,
            ]);
            $results['cross_chapter_bootstrap_designation_rejected'] = false;
        } catch (QueryException $error) {
            $results['cross_chapter_bootstrap_designation_rejected'] = ($error->errorInfo[1] ?? 0) === 1452;
        }

        // 3. Cross-chapter bootstrap: chapter_b with membership_a
        try {
            DB::table('initial_head_bootstraps')->insert([
                'chapter_id' => $chB,
                'designation_id' => $desB,
                'membership_id' => $memA,
                'duty_grant_id' => $grantB,
                'approved_by_user_id' => $approvedBy,
                'executed_by_user_id' => $executedBy,
                'operator_reference' => 'Cross-chapter test',
                'approval_reference' => 'Cross-chapter test',
                'payload_hash' => str_repeat('b', 64),
                'approval_snapshot' => '{}',
                'result_snapshot' => '{}',
                'installed_at' => $time,
            ]);
            $results['cross_chapter_bootstrap_membership_rejected'] = false;
        } catch (QueryException $error) {
            $results['cross_chapter_bootstrap_membership_rejected'] = ($error->errorInfo[1] ?? 0) === 1452;
        }

        // 4. Cross-chapter bootstrap: chapter_b with duty_grant_a
        try {
            DB::table('initial_head_bootstraps')->insert([
                'chapter_id' => $chB,
                'designation_id' => $desB,
                'membership_id' => $memB,
                'duty_grant_id' => $grantA,
                'approved_by_user_id' => $approvedBy,
                'executed_by_user_id' => $executedBy,
                'operator_reference' => 'Cross-chapter test',
                'approval_reference' => 'Cross-chapter test',
                'payload_hash' => str_repeat('c', 64),
                'approval_snapshot' => '{}',
                'result_snapshot' => '{}',
                'installed_at' => $time,
            ]);
            $results['cross_chapter_bootstrap_duty_grant_rejected'] = false;
        } catch (QueryException $error) {
            $results['cross_chapter_bootstrap_duty_grant_rejected'] = ($error->errorInfo[1] ?? 0) === 1452;
        }
    } finally {
        DB::rollBack();
    }

    echo json_encode($results, JSON_THROW_ON_ERROR);
} elseif ($action === 'competing-head') {
    DB::table('memberships')->insert(['chapter_id' => $input['chapter'], 'user_id' => $id,
        'authorized_by_user_id' => $id, 'authorized_at' => now()]);
    $membership = DB::connection()->getPdo()->lastInsertId();
    DB::table('duty_grants')->insert(['chapter_id' => $input['chapter'], 'membership_id' => $membership,
        'role_id' => DB::table('roles')->where('code', 'CHAPTER_HEAD')->value('id'), 'scope_kind' => 'chapter',
        'starts_at' => now()->subHour(), 'revoked_at' => now()]);
    echo '{}';
} elseif ($action === 'revoke-candidate') {
    DB::table('initial_head_candidates')->where('user_id', $id)->whereNull('revoked_at')->update(['revoked_at' => now()]);
    echo '{}';
} elseif ($action === 'end-head-authority') {
    $membership = DB::table('memberships')->where('user_id', $id)->first();
    if ($membership !== null) {
        $time = now()->format('Y-m-d H:i:s.u');
        DB::table('duty_grants')->where('membership_id', $membership->id)->update(['revoked_at' => $time]);
        DB::table('memberships')->where('id', $membership->id)->update(['disabled_at' => $time, 'status' => 'disabled']);
    }
    echo '{}';
} elseif ($action === 'head-authority') {
    $membership = DB::table('memberships')->where('user_id', $id)->first();
    $grant = $membership === null ? null : DB::table('duty_grants')->where('membership_id', $membership->id)->first();
    echo json_encode(['memberships' => DB::table('memberships')->where('user_id', $id)->count(),
        'initial_head_roots_valid' => $membership !== null && $grant !== null
            && DB::table('roles')->where('id', $grant->role_id)->value('code') === 'CHAPTER_HEAD'
            && $grant->scope_kind === 'chapter' && $grant->requesting_unit_id === null && $grant->monetary_limit === null
            && DB::table('chapter_control_guards')->where('chapter_id', $membership->chapter_id)->value('authority_version') === 2
            && DB::table('initial_head_bootstraps')->where('membership_id', $membership->id)->where('duty_grant_id', $grant->id)->count() === 1,
        'grants' => DB::table('duty_grants')->join('memberships', 'memberships.id', '=', 'duty_grants.membership_id')->where('memberships.user_id', $id)->count()], JSON_THROW_ON_ERROR);
} elseif ($action === 'approval-document') {
    $document = array_merge(['user_id' => $id, 'approval_reference' => 'Synthetic independent leadership approval'], $input);
    $path = tempnam(sys_get_temp_dir(), 'ysp-approval-');
    file_put_contents($path, json_encode($document, JSON_THROW_ON_ERROR));
    chmod($path, 0600);
    echo json_encode(['path' => $path], JSON_THROW_ON_ERROR);
} elseif ($action === 'organization') {
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
} elseif ($action === 'bootstrap-count') {
    echo json_encode([
        'bootstraps' => DB::table('initial_head_bootstraps')->where('chapter_id', $id)->count(),
        'memberships' => DB::table('memberships')->where('chapter_id', $id)->count(),
        'duty_grants' => DB::table('duty_grants')->where('chapter_id', $id)->count(),
        'authority_version' => DB::table('chapter_control_guards')->where('chapter_id', $id)->value('authority_version'),
    ], JSON_THROW_ON_ERROR);
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
