<?php

declare(strict_types=1);

namespace App\Modules\DocumentsReporting;

use Illuminate\Support\Facades\DB;

final class SecurityHistory
{
    public function identityCreated(string $userId): void
    {
        DB::table('global_security_events')->insert([
            'user_id' => $userId,
            'event_code' => 'identity_created',
            'operator_reference' => 'os-uid:'.posix_geteuid(),
            'occurred_at' => now(),
            'details' => json_encode(['channel' => 'restricted_cli'], JSON_THROW_ON_ERROR),
        ]);
    }
}
