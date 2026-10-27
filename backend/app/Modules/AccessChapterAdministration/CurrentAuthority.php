<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use Illuminate\Support\Facades\DB;

final class CurrentAuthority
{
    public function requiresMfa(string $userId): bool
    {
        return DB::table('provider_role_grants')
            ->where('user_id', $userId)->whereNull('revoked_at')
            ->where('starts_at', '<=', now())
            ->where(fn ($query) => $query->whereNull('ends_at')->orWhere('ends_at', '>', now()))->exists()
            || DB::table('duty_grants as grants')
                ->join('memberships', function ($join): void {
                    $join->on('memberships.id', '=', 'grants.membership_id')
                        ->on('memberships.chapter_id', '=', 'grants.chapter_id');
                })
                ->join('roles', 'roles.id', '=', 'grants.role_id')
                ->where('memberships.user_id', $userId)->where('memberships.status', 'active')
                ->whereNull('memberships.disabled_at')->whereNull('grants.revoked_at')
                ->where('grants.starts_at', '<=', now())
                ->where(fn ($query) => $query->whereNull('grants.ends_at')->orWhere('grants.ends_at', '>', now()))
                ->whereIn('roles.code', ['CHAPTER_HEAD', 'FINANCE', 'RF_APPROVER', 'SALES_REVIEWER', 'BUDGET_APPROVER', 'INDEPENDENT_REVIEWER'])
                ->exists();
    }
}
