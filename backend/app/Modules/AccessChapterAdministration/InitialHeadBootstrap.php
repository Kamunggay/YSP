<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use Illuminate\Support\Facades\DB;
use RuntimeException;

final class InitialHeadBootstrap
{
    public function __construct(private InitialHeadApproval $approvals) {}

    /** @param array<string, string> $approval
     * @return array<string, mixed>
     */
    public function install(array $approval, string $executor, string $operator): array
    {
        ksort($approval, SORT_STRING);
        $hash = hash('sha256', json_encode([$approval, $executor, $operator], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));

        return DB::transaction(function () use ($approval, $executor, $operator, $hash): array {
            // Match provider lock order: identities, organization, chapter/provisioning,
            // then eligibility. The organization root serializes competing bootstraps.
            DB::table('users')->whereIn('id', array_unique([$approval['user_id'], $approval['approved_by_user_id'], $executor]))
                ->orderBy('id')->lockForUpdate()->get();
            $org = DB::table('organizations')->where('id', $approval['organization_id'])->lockForUpdate()->first();
            $chapter = DB::table('chapters')->where('id', $approval['chapter_id'])
                ->where('organization_id', $approval['organization_id'])->lockForUpdate()->first();
            $provisioning = DB::table('chapter_provisionings')->where('id', $approval['provisioning_id'])
                ->where('chapter_id', $approval['chapter_id'])->where('organization_id', $approval['organization_id'])->lockForUpdate()->first();
            $designation = DB::table('initial_head_designations')->where('provisioning_id', $approval['provisioning_id'])
                ->where('chapter_id', $approval['chapter_id'])->where('user_id', $approval['user_id'])
                ->where('operation_public_id', $approval['designation_operation_id'])->first();
            if ($org === null || $chapter === null || $provisioning === null || $designation === null || $provisioning->status !== 'initial_head_designated') {
                throw new RuntimeException('Approval does not match designation.');
            }
            $existing = DB::table('initial_head_bootstraps')->where('chapter_id', $chapter->id)->first();
            if ($existing !== null) {
                if (! hash_equals($existing->payload_hash, $hash)) {
                    throw new RuntimeException('Initial bootstrap already recorded with different data.');
                }

                // Reporting a retained result never repairs revoked or ended authority.
                return json_decode($existing->result_snapshot, true, flags: JSON_THROW_ON_ERROR);
            }
            $this->approvals->lockIdentities($approval, $executor);
            $candidate = $this->approvals->eligible($approval['organization_id'], $approval['user_id']);
            $headRole = DB::table('roles')->where('code', 'CHAPTER_HEAD')->first();
            $guard = DB::table('chapter_control_guards')->where('chapter_id', $chapter->id)->lockForUpdate()->first();
            if ($candidate === null || $headRole === null || $guard === null
                || DB::table('memberships')->where('chapter_id', $chapter->id)->where('user_id', $approval['user_id'])->exists()
                || DB::table('duty_grants')->where('chapter_id', $chapter->id)->where('role_id', $headRole->id)->exists()) {
                throw new RuntimeException('Initial authority cannot be established.');
            }
            $now = now();
            $time = $now->format('Y-m-d H:i:s.u');
            DB::table('memberships')->insert([
                'chapter_id' => $chapter->id, 'user_id' => $approval['user_id'], 'status' => 'active',
                'authorized_by_user_id' => $approval['approved_by_user_id'], 'authorized_at' => $time,
            ]);
            $membership = DB::connection()->getPdo()->lastInsertId();
            DB::table('duty_grants')->insert([
                'chapter_id' => $chapter->id, 'membership_id' => $membership, 'role_id' => $headRole->id,
                'scope_kind' => 'chapter', 'requesting_unit_id' => null, 'monetary_limit' => null, 'starts_at' => $now,
                'authorized_by_user_id' => $approval['approved_by_user_id'], 'authorized_at' => $now,
            ]);
            $grant = DB::connection()->getPdo()->lastInsertId();
            $result = ['chapter_id' => (string) $chapter->id, 'user_id' => $approval['user_id'],
                'membership_id' => $membership, 'duty_grant_id' => $grant, 'duty' => 'CHAPTER_HEAD',
                'approved_by_user_id' => $approval['approved_by_user_id'], 'executed_by_user_id' => $executor,
                'installed_at' => $now->utc()->format('Y-m-d\TH:i:s.u\Z')];
            DB::table('initial_head_bootstraps')->insert([
                'chapter_id' => $chapter->id, 'designation_id' => $designation->id, 'membership_id' => $membership,
                'duty_grant_id' => $grant, 'approved_by_user_id' => $approval['approved_by_user_id'],
                'executed_by_user_id' => $executor, 'operator_reference' => $operator,
                'approval_reference' => $approval['approval_reference'], 'payload_hash' => $hash,
                'approval_snapshot' => json_encode($approval, JSON_THROW_ON_ERROR),
                'result_snapshot' => json_encode($result, JSON_THROW_ON_ERROR), 'installed_at' => $time,
            ]);
            DB::table('chapter_control_guards')->where('chapter_id', $chapter->id)
                ->update(['authority_version' => $guard->authority_version + 1, 'updated_at' => $time]);
            DB::table('chapter_provisionings')->where('id', $provisioning->id)->increment('row_version');

            return $result;
        }, 3);
    }
}
