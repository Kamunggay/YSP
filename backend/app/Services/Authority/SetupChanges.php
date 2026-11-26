<?php

namespace App\Services\Authority;

use App\Models\AuditLog;
use App\Models\BrowserSession;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\User;
use App\Models\UserMfaCredential;
use Carbon\CarbonImmutable;
use DomainException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class SetupChanges
{
    private readonly array $input;

    private readonly string $target;

    private readonly ?string $chapter;

    private readonly int $version;

    public function __construct(private readonly array $payload, private readonly Collection $users, private readonly User $operator)
    {
        $this->input = $payload['input'];
        $this->target = $payload['target_id'];
        $this->chapter = $payload['chapter_id'];
        $this->version = $payload['expected_version'] + 1;
    }

    public function apply(): array
    {
        return match ($this->payload['procedure_id']) {
            'prepareAccount' => $this->prepareAccount(),
            'prepareChapter' => $this->prepareChapter(),
            'setAccountStatus' => $this->changeAccount(false),
            'resetMfa' => $this->changeAccount(true),
            'setMembership' => $this->setMembership(),
            'setDuty' => $this->setGrant(false),
            'setAlternate' => $this->setGrant(true),
            'recordPolicy' => ['recheck_authority', SetupPolicy::record($this->payload)],
        };
    }

    private function prepareAccount(): array
    {
        $this->checkVersion($this->users->get($this->target));
        $login = mb_strtolower($this->input['login']);
        if (User::where('email', $login)->orWhere('public_id', $login)->lockForUpdate()->first()) {
            throw new DomainException('version_conflict');
        }

        $reference = hash('sha256', $this->input['credential_delivery_reference']);
        $delivery = DB::table('account_onboarding_deliveries')->where('reference_hash', $reference)
            ->where('target_id', $this->target)->where('login', $login)->whereNotNull('password_hash')
            ->where('expires_at', '>', now())->lockForUpdate()->first();
        if (! $delivery || password_get_info($delivery->password_hash)['algo'] === null) {
            throw new DomainException('setup_blocked');
        }

        User::create([
            'id' => $this->target, 'public_id' => $login, 'email' => $login,
            'name' => $this->input['display_name'], 'password_hash' => $delivery->password_hash,
            'status' => 'enabled', 'version' => 1,
        ]);
        DB::table('account_onboarding_deliveries')->where('reference_hash', $reference)->update(['password_hash' => null]);

        return ['none', []];
    }

    private function prepareChapter(): array
    {
        $this->checkVersion(Chapter::whereKey($this->target)->lockForUpdate()->first());
        if (Chapter::where('code', $this->input['reference'])->lockForUpdate()->first()) {
            throw new DomainException('version_conflict');
        }
        if (! ControlledSetup::enabled($this->users->get($this->input['initial_head_user_id']))) {
            throw new DomainException('setup_blocked');
        }
        Chapter::create([
            'id' => $this->target, 'code' => $this->input['reference'], 'name' => $this->input['display_name'],
            'status' => 'setup', 'version' => 1,
        ]);

        return ['none', []];
    }

    private function changeAccount(bool $reset): array
    {
        $target = $this->users->get($this->target);
        $this->checkVersion($target);
        $status = $reset ? $target->status : $this->input['status'];
        if ($reset) {
            $this->verifyIdentity();
        } elseif ($status === 'disabled') {
            $recovery = ControlledSetup::providerGrants('recovery_operator')->orderBy('user_id')->sharedLock()->get();
            if ($recovery->contains('user_id', $this->target) && ! $recovery->contains(fn ($grant) => $grant->user_id !== $this->target
                && ControlledSetup::enabled($this->users->get($grant->user_id))
                && UserMfaCredential::where('user_id', $grant->user_id)->where('is_confirmed', true)
                    ->whereNotNull('encrypted_seed')->sharedLock()->first())) {
                throw new DomainException('setup_blocked');
            }
        }

        $previous = $target->status;
        $target->update(['status' => $status, 'version' => $this->version]);
        if ($reset || $status === 'disabled') {
            foreach ($target->mfaCredential()->lockForUpdate()->get() as $factor) {
                $factor->revokeRecoverySet();
                if ($reset || ! $factor->is_confirmed) {
                    $factor->fill(UserMfaCredential::PENDING_FIELDS + [
                        'secret' => '', 'encrypted_seed' => null, 'accepted_totp_steps' => null,
                        'is_confirmed' => false, 'version' => $factor->version + 1,
                    ]);
                }
                $factor->save();
            }
            BrowserSession::where('user_id', $target->id)->delete();
        }

        return [$reset ? 'require_reenrollment' : ($status === 'disabled' ? 'revoke_all' : 'none'), ['prior_status' => $previous]];
    }

    private function verifyIdentity(): void
    {
        $verifier = $this->input['verified_by_user_id'];
        $records = AuditLog::where('action', 'setup:identityVerification')->whereNull('chapter_id')
            ->where('entity_id', $this->target)->where('user_id', $verifier)->sharedLock()->get();

        if (! ControlledSetup::enabled($this->users->get($verifier))
            || in_array($verifier, [$this->operator->id, $this->target], true)
            || $this->input['verified_at'] > now()->toISOString()
            || ! $records->contains(fn (AuditLog $record) => ! isset($record->details['revoked_at'])
                && ($record->details['verified_at'] ?? null) === $this->input['verified_at']
                && ($record->details['reference'] ?? null) === $this->input['identity_verification_reference']
                && ($record->details['lost_factor_reason'] ?? null) === $this->input['lost_factor_reason']
                && ($record->details['expires_at'] ?? '') > now()->toISOString())) {
            throw new DomainException('identity_verification_required');
        }
    }

    private function setMembership(): array
    {
        $input = $this->input;
        $membership = ChapterMembership::whereKey($this->target)->lockForUpdate()->first();
        $active = $input['status'] === 'active';
        $this->checkVersion($membership);
        if ($membership && ($membership->chapter_id !== $this->chapter || $membership->user_id !== $input['user_id'])) {
            throw new DomainException('setup_blocked');
        }
        if ((! $membership && ! $active) || ($active && ! ControlledSetup::enabled($this->users->get($input['user_id'])))
            || ChapterMembership::where('chapter_id', $this->chapter)->where('user_id', $input['user_id'])
                ->whereKeyNot($this->target)->lockForUpdate()->first()) {
            throw new DomainException('setup_blocked');
        }
        $from = CarbonImmutable::parse($input['effective_from']);
        if ($active ? $from->isPast() : $from->isFuture()) {
            throw new DomainException('invalid_input');
        }

        $prior = $membership?->membership_status;
        if (! $active) {
            DutyGrant::where('chapter_id', $this->chapter)->where('user_id', $input['user_id'])->where('status', 'active')
                ->update(['status' => 'revoked', 'version' => DB::raw('version + 1')]);
        }
        ($membership ?? new ChapterMembership(['id' => $this->target]))->fill([
            'chapter_id' => $this->chapter, 'user_id' => $input['user_id'], 'membership_status' => $input['status'],
            'version' => $this->version, 'effective_from' => $active ? $from->format('Y-m-d H:i:s.u') : $membership->effective_from,
        ])->save();

        return ['recheck_authority', ['prior_status' => $prior]];
    }

    private function setGrant(bool $alternate): array
    {
        $grant = DutyGrant::whereKey($this->target)->lockForUpdate()->first();
        $this->checkVersion($grant);
        $input = $this->input;
        $active = $input['status'] === 'active';
        $membership = ChapterMembership::whereKey($input['membership_id'])->where('chapter_id', $this->chapter)
            ->lockForUpdate()->first();
        $user = $this->users->get($membership?->user_id);
        $replaced = $input['replaces_user_id'] ?? null;
        $unit = $input['scope']['unit_id'];
        if (! $membership || ! $user || (! $grant && ! $active)
            || ($grant && ($grant->chapter_id !== $this->chapter || $grant->user_id !== $user->id
                || $grant->duty_code !== $input['duty'] || $grant->is_alternate !== $alternate || $grant->replaces_user_id !== $replaced))
            || ($active && (! $membership->isCurrent() || ! ControlledSetup::enabled($user)
                || ($unit !== null && ! SetupPolicy::unitExists($this->chapter, $unit))))) {
            throw new DomainException('setup_blocked');
        }

        $from = CarbonImmutable::parse($input['effective_from']);
        $until = $input['effective_until'] === null ? null : CarbonImmutable::parse($input['effective_until']);
        if (($active ? $from->isPast() : $from->isFuture()) || ($until && $until <= $from)) {
            throw new DomainException('invalid_input');
        }

        $otherGrants = DutyGrant::where('chapter_id', $this->chapter)->where('duty_code', $input['duty'])
            ->where('status', 'active')->whereIn('user_id', array_filter([$user->id, $replaced]))->whereKeyNot($this->target)
            ->orderBy('id')->lockForUpdate()->get();
        if ($active && $otherGrants->contains(fn (DutyGrant $other) => $other->user_id === $user->id
            && $other->is_alternate === $alternate && ($other->scope['unit_id'] ?? null) === $unit
            && (! $other->valid_until || $other->valid_until > $from)
            && (! $until || ! $other->valid_from || $other->valid_from < $until)
            && (! $alternate || $other->alternateDecisionScope() === $input['decision_scope_reference']))) {
            throw new DomainException('setup_blocked');
        }

        if ($active && $alternate) {
            $primary = $this->users->get($replaced);
            if ($replaced === $user->id || in_array($user->id, array_column($this->payload['approvals'], 'approver_id'), true)
                || ! $user->mfaCredential()->where('is_confirmed', true)->whereNotNull('encrypted_seed')->sharedLock()->first()
                || ! ControlledSetup::enabled($primary)
                || ! $primary->memberships()->current()->where('chapter_id', $this->chapter)->sharedLock()->first()
                || ! $otherGrants->contains(fn (DutyGrant $source) => $source->user_id === $replaced && ! $source->is_alternate
                    && (! $source->valid_from || ! $source->valid_from->isFuture())
                    && (! $source->valid_until || $source->valid_until >= $until)
                    && ChapterAuthority::covers($source, $unit, $input['scope']['limit_php']))) {
                throw new DomainException('setup_blocked');
            }
        }

        $prior = $grant?->status;
        $grant ??= new DutyGrant(['id' => $this->target]);
        $grant->fill([
            'chapter_id' => $this->chapter, 'user_id' => $user->id, 'duty_code' => $input['duty'],
            'is_alternate' => $alternate, 'replaces_user_id' => $replaced, 'status' => $input['status'],
            'version' => $this->version,
        ]);
        if ($active) {
            $grant->fill(['scope' => $input['scope'], 'valid_from' => $from, 'valid_until' => $until]);
        }
        $grant->save();

        return ['recheck_authority', ['prior_status' => $prior] + ($alternate ? [
            'decision_scope_reference' => $input['decision_scope_reference'],
            'grant_sha256' => $grant->approvalDigest(),
        ] : [])];
    }

    private function checkVersion(?Model $record): void
    {
        if ((int) ($record?->version ?? 0) !== $this->payload['expected_version'] || $this->version > 2147483647) {
            throw new DomainException('version_conflict');
        }
    }
}
