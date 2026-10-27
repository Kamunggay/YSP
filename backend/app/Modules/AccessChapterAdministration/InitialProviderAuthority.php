<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use Illuminate\Support\Facades\DB;
use RuntimeException;

final class InitialProviderAuthority
{
    public function install(string $provider, string $organization, string $approver, string $operator, string $approval): void
    {
        DB::transaction(function () use ($provider, $organization, $approver, $operator, $approval): void {
            $users = DB::table('users')->whereIn('id', [$provider, $approver])->orderBy('id')->lockForUpdate()->get();
            $org = DB::table('organizations')->where('id', $organization)->lockForUpdate()->first();
            if ($provider === $approver || $users->count() !== 2 || $users->where('status', 'active')->count() !== 2 || $org === null
                || DB::table('initial_provider_installations')->where('organization_id', $organization)->orWhere('provider_user_id', $provider)->exists()
                || DB::table('provider_role_grants')->where('organization_id', $organization)->where('role_code', 'provisioner')->exists()
                || DB::table('provider_role_grants')->where('user_id', $provider)->where('role_code', 'provisioner')->exists()) {
                throw new RuntimeException('Initial authority cannot be installed.');
            }
            $now = now();
            DB::table('provider_role_grants')->insert([
                'organization_id' => $organization, 'user_id' => $provider, 'role_code' => 'provisioner',
                'granted_by_user_id' => $approver, 'starts_at' => $now, 'reason' => $approval,
            ]);
            $grant = DB::connection()->getPdo()->lastInsertId();
            DB::table('initial_provider_installations')->insert([
                'organization_id' => $organization, 'provider_user_id' => $provider, 'provider_role_grant_id' => $grant,
                'approved_by_user_id' => $approver, 'operator_reference' => $operator,
                'approval_reference' => $approval, 'installed_at' => $now,
            ]);
            DB::table('global_security_events')->insert([
                'user_id' => $provider, 'event_code' => 'initial_provider_installed', 'operator_reference' => $operator,
                'occurred_at' => $now, 'details' => json_encode(['organization_id' => $organization,
                    'approved_by_user_id' => $approver, 'approval_reference' => $approval], JSON_THROW_ON_ERROR),
            ]);
        }, 3);
    }
}
