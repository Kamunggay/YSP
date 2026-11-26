<?php

namespace App\Services\Authority;

use App\Models\AuditLog;
use App\Models\BrowserSession;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\IdempotencyRecord;
use App\Models\User;
use App\Services\Shared\CanonicalJson;
use DomainException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PDOException;

final class ControlledSetup
{
    public function execute(string $procedure, mixed $body, #[\SensitiveParameter] ?string $sessionToken): array
    {
        $actor = null;
        $payload = null;
        $key = is_string($body->action_key ?? null) && preg_match(\App\Http\Requests\AuthInput::UUID, $body->action_key)
            ? $body->action_key : (string) Str::uuid();

        try {
            $payload = ControlledSetupInput::validate($procedure, $body);

            return DB::transaction(function () use ($procedure, $payload, $sessionToken, &$actor) {
                $actor = null;
                $session = BrowserSession::forToken($sessionToken);
                if (! $session || $session->next_step !== null || ! $session->authenticated_at
                    || ! in_array($session->authentication_method, ['authenticator', 'recovery_code'], true)) {
                    throw new DomainException('operator_denied');
                }

                $users = $this->lockUsers($session->user_id, $payload);
                $operator = $users->get($session->user_id);
                if (! self::enabled($operator) || (int) $operator->version !== (int) $session->user_version) {
                    throw new DomainException('operator_denied');
                }
                $actor = $operator->id;
                if ($actor !== $payload['operator_id']) {
                    throw new DomainException('operator_denied');
                }

                $chapter = $payload['chapter_id'] === null ? null : Chapter::whereKey($payload['chapter_id'])
                    ->whereIn('status', ChapterAuthority::AVAILABLE_CHAPTERS)->lockForUpdate()->first();
                $bootstrap = $chapter && $this->appointedHead($chapter, $payload);
                $this->authorizeOperator($operator, $payload, $chapter, $bootstrap);

                $operation = 'controlled:'.$procedure;
                $fingerprint = CanonicalJson::sha256($payload);
                $receipt = IdempotencyRecord::where('user_id', $actor)->where('chapter_id', $payload['chapter_id'])
                    ->where('operation_name', $operation)->where('key', $payload['action_key'])->lockForUpdate()->first();
                if ($receipt) {
                    if (! hash_equals($receipt->payload_hash, $fingerprint)) {
                        throw new DomainException('action_key_conflict');
                    }

                    return ['outcome' => 'replayed'] + json_decode($receipt->response_body, true, flags: JSON_THROW_ON_ERROR);
                }

                $this->verifyApprovals($payload, $users, $chapter, $bootstrap);
                [$effect, $details] = (new SetupChanges($payload, $users, $operator))->apply();
                $audit = $this->audit($operation, $procedure, $payload['chapter_id'], $actor, $payload['target_id'], [
                    'action_key' => $payload['action_key'],
                    'fingerprint' => $fingerprint,
                    'reason' => $payload['reason'],
                    'approvals' => $payload['approvals'],
                    'prior_version' => $payload['expected_version'],
                    'version' => $payload['expected_version'] + 1,
                    'input' => $payload['input'],
                ] + $details);

                $result = [
                    'outcome' => 'committed',
                    'procedure_id' => $procedure,
                    'action_key' => $payload['action_key'],
                    'target_id' => $payload['target_id'],
                    'version' => $payload['expected_version'] + 1,
                    'audit_id' => $audit,
                    'committed_at' => now()->toISOString(),
                    'session_effect' => $effect,
                ];

                IdempotencyRecord::create([
                    'key' => $payload['action_key'],
                    'chapter_id' => $payload['chapter_id'],
                    'user_id' => $actor,
                    'operation_name' => $operation,
                    'resource_id' => $payload['target_id'],
                    'payload_hash' => $fingerprint,
                    'response_code' => 200,
                    'response_body' => json_encode($result, JSON_THROW_ON_ERROR),
                ]);

                return $result;
            }, 5);
        } catch (DomainException|PDOException $failure) {
            $code = $failure instanceof DomainException ? $failure->getMessage()
                : (DB::connection()->getDriverName() === 'mysql' && ($failure->errorInfo[1] ?? null) === 1062
                    ? 'version_conflict' : 'unavailable');
            $audit = (string) Str::uuid();
            try {
                $this->audit('controlled:rejected', $procedure, $payload['chapter_id'] ?? null, $actor,
                    $payload['target_id'] ?? $key, ['action_key' => $key, 'code' => $code], $audit);
            } catch (PDOException) {
                $code = 'unavailable';
            }

            return ['outcome' => 'rejected', 'procedure_id' => $procedure, 'action_key' => $key, 'code' => $code, 'audit_id' => $audit];
        }
    }

    private function lockUsers(?string $actor, array $payload): Collection
    {
        $input = $payload['input'];
        $member = isset($input['membership_id']) ? ChapterMembership::find($input['membership_id']) : null;
        $ids = [
            $actor, $member?->user_id, $input['user_id'] ?? null, $input['initial_head_user_id'] ?? null,
            $input['replaces_user_id'] ?? null, $input['verified_by_user_id'] ?? null,
            ...array_column($payload['approvals'], 'approver_id'),
        ];
        if (in_array($payload['procedure_id'], ['prepareAccount', 'resetMfa', 'setAccountStatus'], true)) {
            $ids[] = $payload['target_id'];
        }
        if ($payload['procedure_id'] === 'setAccountStatus' && $input['status'] === 'disabled') {
            $ids = [...$ids, ...$this->providerGrants('recovery_operator')->pluck('user_id')];
        }

        return User::whereIn('id', array_unique(array_filter($ids)))->orderBy('id')->lockForUpdate()->get()->keyBy('id');
    }

    private function authorizeOperator(User $operator, array $payload, ?Chapter $chapter, bool $bootstrap): void
    {
        $now = now()->format('Y-m-d H:i:s.u');
        $procedure = $payload['procedure_id'];
        if ($payload['chapter_id'] === null) {
            $role = $procedure === 'resetMfa' ? 'recovery_operator' : 'provisioner';
            $allowed = $this->providerGrants($role)->where('user_id', $operator->id)->sharedLock()->first();
        } elseif ($chapter) {
            $allowed = DB::table('chapter_setup_entitlements')->where('chapter_id', $chapter->id)
                ->where('user_id', $operator->id)->where('procedure_id', $procedure)
                ->where('starts_at', '<=', $now)->whereNull('revoked_at')
                ->where(fn ($query) => $query->whereNull('ends_at')->orWhere('ends_at', '>', $now))->sharedLock()->first();
            if (! $allowed && $bootstrap) {
                $allowed = $this->providerGrants('provisioner')->where('user_id', $operator->id)->sharedLock()->first();
            }
        }

        if (! ($allowed ?? null)) {
            throw new DomainException('operator_denied');
        }
    }

    private function appointedHead(Chapter $chapter, array $payload): bool
    {
        if (! in_array($payload['procedure_id'], ['setMembership', 'setDuty'], true)
            || $payload['expected_version'] !== 0 || $payload['input']['status'] !== 'active') {
            return false;
        }

        $input = $payload['input'];
        $appointment = AuditLog::where('action', 'controlled:prepareChapter')->where('entity_id', $chapter->id)->sharedLock()->first();
        $head = $appointment?->details['input']['initial_head_user_id'] ?? null;
        if (! $head) {
            return false;
        }
        if ($payload['procedure_id'] === 'setMembership') {
            return $head === $input['user_id'];
        }

        return $input['duty'] === 'CHAPTER_HEAD' && $input['scope']['unit_id'] === null
            && $chapter->memberships()->whereKey($input['membership_id'])->where('user_id', $head)->sharedLock()->first() !== null;
    }

    private function verifyApprovals(array $payload, Collection $users, ?Chapter $chapter, bool $bootstrap): void
    {
        $authority = match (true) {
            $payload['procedure_id'] === 'resetMfa' => 'PROVIDER_RECOVERY',
            $bootstrap, $chapter === null => 'PROVIDER_PROVISIONING',
            $payload['procedure_id'] === 'recordPolicy' && $payload['input']['ownership'] === 'financial' => 'FINANCE',
            default => 'CHAPTER_HEAD',
        };

        $digest = CanonicalJson::sha256(array_diff_key($payload, ['action_key' => true, 'approvals' => true]));
        foreach ($payload['approvals'] as $approval) {
            $record = AuditLog::whereKey($approval['id'])->where('action', 'setup:approval')
                ->where('chapter_id', $payload['chapter_id'])->where('entity_id', $payload['target_id'])
                ->where('user_id', $approval['approver_id'])->sharedLock()->first();
            $approver = $users->get($approval['approver_id']);
            $details = $record?->details ?? [];
            if (! self::enabled($approver) || $approval['authority'] !== $authority || isset($details['revoked_at'])
                || $approval['approved_at'] > now()->toISOString()
                || CanonicalJson::encode($details['approval'] ?? []) !== CanonicalJson::encode($approval)
                || ! hash_equals($details['intent_sha256'] ?? '', $digest)
                || (isset($details['expires_at']) && $details['expires_at'] <= now()->toISOString())
                || ! $this->approverHasAuthority($approver, $authority, $payload, $chapter, $details)) {
                throw new DomainException('approval_required');
            }
        }
    }

    private function approverHasAuthority(User $approver, string $authority, array $payload, ?Chapter $chapter, array $details): bool
    {
        if ($authority === 'PROVIDER_RECOVERY') {
            return ! in_array($approver->id, [$payload['operator_id'], $payload['target_id']], true)
                && $this->providerGrants('recovery_operator')->where('user_id', $approver->id)->sharedLock()->first() !== null;
        }
        if ($authority === 'PROVIDER_PROVISIONING') {
            return ($approver->id !== $payload['operator_id'] || ($details['allow_self_execution'] ?? false) === true)
                && $this->providerGrants('provisioner')->where('user_id', $approver->id)->sharedLock()->first() !== null;
        }

        $membership = $approver->memberships()->current()->where('chapter_id', $chapter->id)->sharedLock()->first();
        $factor = $approver->mfaCredential()->where('is_confirmed', true)->whereNotNull('encrypted_seed')->sharedLock()->first();

        return $membership && $factor && ChapterAuthority::fromMembership($membership, $chapter)->allowsDuty($authority);
    }

    public static function providerGrants(string $role): \Illuminate\Database\Query\Builder
    {
        return DB::table('provider_role_grants')->where('role_code', $role)
            ->where('starts_at', '<=', now()->format('Y-m-d H:i:s.u'))->whereNull('revoked_at')
            ->where(fn ($query) => $query->whereNull('ends_at')->orWhere('ends_at', '>', now()->format('Y-m-d H:i:s.u')));
    }

    public static function enabled(?User $user): bool
    {
        return $user && in_array($user->status, ['enabled', 'active'], true);
    }

    private function audit(string $action, string $procedure, ?string $chapter, ?string $actor, string $target, array $details, ?string $id = null): string
    {
        return AuditLog::create([
            'id' => $id ?? (string) Str::uuid(),
            'action' => $action,
            'entity_type' => $procedure,
            'entity_id' => $target,
            'chapter_id' => $chapter,
            'user_id' => $actor,
            'details' => $details,
        ])->id;
    }
}
