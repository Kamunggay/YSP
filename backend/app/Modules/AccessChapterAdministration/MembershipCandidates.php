<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use Illuminate\Support\Facades\DB;
use RuntimeException;

final class MembershipCandidates
{
    public function __construct(private InitialHeadApproval $approvals) {}

    public function authorize(string $path, string $executor, string $operator): void
    {
        $approval = $this->approvals->read($path, 'membership_authorization', $executor, $operator);
        DB::transaction(function () use ($approval, $executor, $operator): void {
            $this->approvals->lockIdentities($approval, $executor);
            if (! DB::table('chapters')->where('id', $approval['chapter_id'])->lockForUpdate()->exists()) {
                throw new RuntimeException('Chapter unavailable.');
            }
            DB::table('membership_candidates')->insert([
                'chapter_id' => $approval['chapter_id'], 'user_id' => $approval['user_id'],
                'purpose' => $approval['purpose'], 'approved_by_user_id' => $approval['approved_by_user_id'],
                'executed_by_user_id' => $executor, 'operator_reference' => $operator,
                'approval_reference' => $approval['approval_reference'], 'authorized_at' => now(),
            ]);
        }, 3);
    }

    public function eligible(string $chapterId, string $userId): ?object
    {
        return DB::table('membership_candidates as candidates')->join('users', 'users.id', '=', 'candidates.user_id')
            ->where('candidates.chapter_id', $chapterId)->where('candidates.user_id', $userId)
            ->where('candidates.purpose', 'membership_authorization')->where('users.status', 'active')
            ->whereNull('users.disabled_at')->whereNull('candidates.revoked_at')->where('candidates.authorized_at', '<=', now())
            ->where(fn ($query) => $query->whereNull('candidates.ends_at')->orWhere('candidates.ends_at', '>', now()))
            ->select('users.id', 'users.name')->orderBy('candidates.id')->sharedLock()->first();
    }
}
