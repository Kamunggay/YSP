<?php

declare(strict_types=1);

namespace App\Modules\DocumentsReporting;

use Illuminate\Support\Facades\DB;

final class SecurityHistory
{
    public function identityCreated(string $userId, string $operatorReference): void
    {
        DB::table('global_security_events')->insert([
            'user_id' => $userId,
            'event_code' => 'identity_created',
            'operator_reference' => $operatorReference,
            'occurred_at' => now(),
            'details' => json_encode(['channel' => 'restricted_cli', 'service_uid' => posix_geteuid()], JSON_THROW_ON_ERROR),
        ]);
    }
}
