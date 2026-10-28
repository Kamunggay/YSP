<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use Illuminate\Support\Facades\DB;
use RuntimeException;

final class InitialHeadApproval
{
    /** @return array<string, string> */
    public function read(string $path, string $purpose, string $executor, string $operator): array
    {
        if (! self::validId($executor) || trim($operator) === '' || mb_strlen($operator) > 160
            || preg_match('/[\x00-\x1F\x7F]/', $operator) || ! is_file($path) || ! is_readable($path)
            || filesize($path) > 8192) {
            throw new RuntimeException('Invalid approval document.');
        }
        $document = app(CanonicalApprovalDecoder::class)->decode((string) file_get_contents($path));
        $keys = ['purpose', 'organization_id', 'user_id', 'approved_by_user_id', 'approval_reference'];
        if ($purpose === 'membership_authorization') {
            $keys = ['purpose', 'chapter_id', 'user_id', 'approved_by_user_id', 'approval_reference'];
        }
        if ($purpose === 'initial_head_membership') {
            $keys = array_merge($keys, ['chapter_id', 'provisioning_id', 'designation_operation_id']);
        }
        if (array_diff(array_keys($document), $keys) !== [] || array_diff($keys, array_keys($document)) !== []
            || ($document['purpose'] ?? null) !== $purpose) {
            throw new RuntimeException('Approval does not match its purpose.');
        }
        foreach ($document as $key => $value) {
            if (! is_string($value) || (str_ends_with($key, '_id') && $key !== 'designation_operation_id' && ! self::validId($value))) {
                throw new RuntimeException('Invalid approval binding.');
            }
        }
        if (trim($document['approval_reference']) === '' || mb_strlen($document['approval_reference']) > 500
            || preg_match('/[\x00-\x1F\x7F]/', $document['approval_reference'])
            || $document['approved_by_user_id'] === $executor
            || ($purpose === 'initial_head_membership' && ! preg_match('/^[0-9A-HJKMNP-TV-Z]{26}$/D', $document['designation_operation_id']))) {
            throw new RuntimeException('Independent approval attribution is required.');
        }

        return $document;
    }

    public static function validId(mixed $id): bool
    {
        return is_string($id) && preg_match('/^[1-9][0-9]{0,19}$/D', $id) === 1
            && (strlen($id) < 20 || strcmp($id, '18446744073709551615') <= 0);
    }

    /** @param array<string, string> $approval */
    public function lockIdentities(array $approval, string $executor): void
    {
        $ids = array_unique([$approval['user_id'], $approval['approved_by_user_id'], $executor]);
        $users = DB::table('users')->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
        if ($users->count() !== count($ids) || $users->where('status', 'active')->whereNull('disabled_at')->count() !== count($ids)) {
            throw new RuntimeException('Approval identities are unavailable.');
        }
    }

    /** @param array<string, string> $approval */
    public function authorizeCandidate(array $approval, string $executor, string $operator): void
    {
        DB::transaction(function () use ($approval, $executor, $operator): void {
            $this->lockIdentities($approval, $executor);
            if (DB::table('organizations')->where('id', $approval['organization_id'])->lockForUpdate()->first() === null) {
                throw new RuntimeException('Organization unavailable.');
            }
            DB::table('initial_head_candidates')->insert([
                'organization_id' => $approval['organization_id'], 'user_id' => $approval['user_id'],
                'purpose' => $approval['purpose'], 'approved_by_user_id' => $approval['approved_by_user_id'],
                'executed_by_user_id' => $executor, 'operator_reference' => $operator,
                'approval_reference' => $approval['approval_reference'], 'authorized_at' => now(),
            ]);
        }, 3);
    }

    public function eligible(string $organization, string $user): ?object
    {
        // Use the same indexed query for every valid exact ID, including absent targets.
        return DB::table('initial_head_candidates as candidates')->join('users', 'users.id', '=', 'candidates.user_id')
            ->where('candidates.organization_id', $organization)->where('candidates.user_id', $user)
            ->where('candidates.purpose', 'initial_head_appointment')->where('users.status', 'active')
            ->whereNull('users.disabled_at')->whereNull('candidates.revoked_at')->where('candidates.authorized_at', '<=', now())
            ->where(fn ($query) => $query->whereNull('candidates.ends_at')->orWhere('candidates.ends_at', '>', now()))
            ->select('users.id', 'users.name')->orderBy('candidates.id')->lockForUpdate()->first();
    }
}
