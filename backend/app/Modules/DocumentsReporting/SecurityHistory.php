<?php

declare(strict_types=1);

namespace App\Modules\DocumentsReporting;

use Illuminate\Support\Facades\DB;

final class SecurityHistory
{
    public function identityCreated(string $userId, string $operatorReference): void
    {
        $serviceUid = function_exists('posix_geteuid') ? posix_geteuid() : (function_exists('getmyuid') ? getmyuid() : 0);
        DB::table('global_security_events')->insert([
            'user_id' => $userId,
            'event_code' => 'identity_created',
            'operator_reference' => $operatorReference,
            'occurred_at' => now(),
            'details' => json_encode(['channel' => 'restricted_cli', 'service_uid' => $serviceUid], JSON_THROW_ON_ERROR),
        ]);
    }
}
