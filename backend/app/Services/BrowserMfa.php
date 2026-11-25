<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\BrowserMfaReceipt;
use App\Models\BrowserSession;
use App\Models\User;
use App\Models\UserMfaCredential;
use Closure;
use Illuminate\Support\Str;
use OTPHP\TOTP;

class BrowserMfa
{
    public const INPUTS = [
        'begin' => ['password'],
        'confirm' => ['enrollment_id', 'password', 'authenticator_code'],
        'authenticator' => ['authenticator_code'],
        'recovery' => ['recovery_code'],
        'rotate' => ['password', 'authenticator_code', 'expected_recovery_set_id'],
    ];

    private ?UserMfaCredential $factor;

    public function __construct(
        private BrowserSession $session,
        private User $user,
        private Closure $verifyPassword,
    ) {
        $this->factor = $this->user->mfaCredential()->first();
    }

    public function recoveryStatus(): array
    {
        $factor = $this->fullFactor();
        $set = null;
        if ($factor->recovery_set_id !== null) {
            $expires = $factor->recovery_set_created_at->addDays(365);
            $set = [
                'id' => $factor->recovery_set_id,
                'remaining' => $expires->isFuture() ? count($factor->recovery_codes) : 0,
                'created_at' => $factor->recovery_set_created_at->toISOString(),
                'expires_at' => $expires->toISOString(),
            ];
        }

        return ['recovery_set' => $set];
    }

    private function fullFactor(): UserMfaCredential
    {
        if ($this->session->next_step !== null) {
            throw new MfaDenied(403, 'mfa_incomplete', 'Complete multifactor authentication first.');
        }

        if (! $this->factor?->is_confirmed) {
            throw new MfaDenied(403, 'factor_not_enrolled', 'Enroll an authenticator first.');
        }

        return $this->factor;
    }

    public function assertAdmission(string $operation): void
    {
        if ($operation === 'rotate') {
            $this->fullFactor();
        }

        $step = $this->session->next_step;
        if (($step === 'challenge_authenticator' && in_array($operation, ['begin', 'confirm'], true))
            || ($step === 'enroll_authenticator' && in_array($operation, ['authenticator', 'recovery'], true))) {
            throw new MfaDenied(403, 'continuation_mismatch', 'Use the indicated authentication step.');
        }
    }

    public function eraseExpiredSecrets(): void
    {
        $this->session->mfaReceipts()->whereNotNull('delivery')
            ->where('delivery_expires_at', '<=', now())->update(['delivery' => null]);
        if ($this->factor?->pending_expires_at && ! $this->factor->pending_expires_at->isFuture()) {
            $this->factor->update(UserMfaCredential::PENDING_FIELDS + ['encrypted_seed' => null]);
        }
    }

    public function perform(string $operation, string $key, #[\SensitiveParameter] array $input, string $token): array
    {
        $fingerprint = hash_hmac('sha256', json_encode($input, JSON_THROW_ON_ERROR), app('encrypter')->getKey());
        $receipt = $this->session->mfaReceipts()->where('operation', $operation)->where('action_key', $key)->first();
        $factor = $this->factor;
        if ($receipt) {
            if (! hash_equals($receipt->fingerprint, $fingerprint)) {
                throw new MfaDenied(409, 'action_key_conflict', 'Use a new action key for changed input.');
            }

            return [$this->replay($operation, $receipt, $factor, $input), $token, true];
        }

        $receipt = $this->session->mfaReceipts()->make([
            'operation' => $operation,
            'action_key' => $key,
            'fingerprint' => $fingerprint,
        ]);

        if (($operation === 'begin' || ($operation === 'confirm' && $this->session->next_step === null))
            && $factor?->is_confirmed) {
            throw new MfaDenied(409, 'factor_exists', 'An authenticator is already enrolled.');
        }

        $result = match ($operation) {
            'begin' => $this->begin($factor, $input, $receipt),
            'confirm' => $this->confirm($factor, $input, $token),
            'authenticator', 'recovery' => $this->challenge($operation, $factor, $input, $token),
            'rotate' => $this->rotate($this->fullFactor(), $input),
        };

        if ($operation === 'confirm' || $operation === 'rotate') {
            $receipt->recovery_set_id = $result['recovery_set']['id'];
            $receipt->delivery = $result;
            $receipt->delivery_expires_at = min(now()->startOfSecond()->addMinutes(5), $this->session->expires_at);
        } elseif ($operation !== 'begin') {
            $receipt->result = $result;
        }
        $receipt->save();

        AuditLog::create([
            'user_id' => $this->user->id,
            'action' => 'auth:'.$operation,
            'entity_type' => 'browser_session',
            'entity_id' => $this->session->id,
            'details' => ['action_key' => $key],
        ]);

        return [$result, $token, false];
    }

    private function replay(string $operation, BrowserMfaReceipt $receipt, ?UserMfaCredential $factor, #[\SensitiveParameter] array $input): array
    {
        if ($operation === 'begin') {
            $this->requirePending($factor, $receipt->result['enrollment_id']);
            $this->requirePassword($input['password']);

            return $this->enrollment($factor);
        }

        if ($operation === 'confirm' || $operation === 'rotate') {
            if ($this->session->next_step !== null || $this->session->authentication_method !== 'authenticator'
                || ! $factor?->is_confirmed || $factor->recovery_set_id !== $receipt->recovery_set_id
                || count($factor->recovery_codes ?? []) !== 10 || ! $receipt->delivery_expires_at->isFuture()
                || $receipt->getRawOriginal('delivery') === null) {
                if ($receipt->getRawOriginal('delivery') !== null) {
                    $receipt->update(['delivery' => null]);
                }
                throw new MfaDenied(409, 'secret_delivery_expired', 'Review current recovery-set status.');
            }

            $this->requirePassword($input['password']);

            return $receipt->delivery;
        }

        return $receipt->result;
    }

    private function begin(?UserMfaCredential $factor, #[\SensitiveParameter] array $input, BrowserMfaReceipt $receipt): array
    {
        $this->requirePassword($input['password']);
        if ($factor?->pending_expires_at?->isFuture()) {
            throw new MfaDenied(409, 'enrollment_pending', 'Finish the pending enrollment or wait for its expiry.');
        }

        $factor ??= $this->user->mfaCredential()->make(['secret' => '']);
        $factor->fill([
            'encrypted_seed' => TOTP::generate(secretSize: 20)->getSecret(),
            'enrollment_id' => (string) Str::uuid(),
            'pending_browser_session_id' => $this->session->id,
            'pending_expires_at' => min(now()->startOfSecond()->addMinutes(5), $this->session->expires_at),
        ])->save();
        $receipt->result = ['enrollment_id' => $factor->enrollment_id];

        return $this->enrollment($factor);
    }

    private function enrollment(UserMfaCredential $factor): array
    {
        $authenticator = TOTP::createFromSecret($factor->encrypted_seed)
            ->withLabel($this->user->id)->withIssuer('YSP');

        return [
            'enrollment_id' => $factor->enrollment_id,
            'secret' => $authenticator->getSecret(),
            'provisioning_uri' => $authenticator->getProvisioningUri(),
            'expires_at' => $factor->pending_expires_at->toISOString(),
        ];
    }

    private function confirm(?UserMfaCredential $factor, #[\SensitiveParameter] array $input, string &$token): array
    {
        $this->requirePending($factor, $input['enrollment_id']);
        $this->requirePassword($input['password']);
        $factor->accepted_totp_steps = $this->acceptTotp($factor, $input['authenticator_code']);
        $factor->fill(UserMfaCredential::PENDING_FIELDS + ['is_confirmed' => true]);
        $token = $this->session->completeMfa('authenticator');

        return $this->deliverSet($factor);
    }

    private function requirePending(?UserMfaCredential $factor, string $enrollmentId): void
    {
        if ($factor?->enrollment_id !== $enrollmentId || $factor->pending_browser_session_id !== $this->session->id
            || ! $factor->pending_expires_at?->isFuture()) {
            throw new MfaDenied(409, 'enrollment_expired', 'Start a new enrollment.');
        }
    }

    private function challenge(string $operation, ?UserMfaCredential $factor, #[\SensitiveParameter] array $input, string &$token): array
    {
        if ($this->session->next_step === null) {
            throw new MfaDenied(409, 'session_state_conflict', 'Review the current session before starting another intent.');
        }
        if (! $factor?->is_confirmed) {
            $this->invalidFactor();
        }

        if ($operation === 'authenticator') {
            $factor->accepted_totp_steps = $this->acceptTotp($factor, $input['authenticator_code']);
        } else {
            $this->consumeRecoveryCode($factor, $input['recovery_code']);
        }
        $factor->save();
        $token = $this->session->completeMfa($operation === 'recovery' ? 'recovery_code' : 'authenticator');

        return $this->session->projection($this->user);
    }

    private function rotate(UserMfaCredential $factor, #[\SensitiveParameter] array $input): array
    {
        $this->requirePassword($input['password']);
        $steps = $this->acceptTotp($factor, $input['authenticator_code']);
        if ($factor->recovery_set_id !== $input['expected_recovery_set_id']) {
            throw new MfaDenied(409, 'recovery_set_conflict', 'Review current recovery-set status.');
        }

        $factor->accepted_totp_steps = $steps;
        $this->session->update(['authentication_method' => 'authenticator', 'authenticated_at' => now()->startOfSecond()]);

        return $this->deliverSet($factor);
    }

    private function deliverSet(UserMfaCredential $factor): array
    {
        $factor->revokeRecoverySet();
        $created = now()->startOfSecond();
        $codes = [];
        while (count($codes) < 10) {
            $code = implode('-', str_split(TOTP::generate(secretSize: 10)->getSecret(), 4));
            $codes[$code] = $this->recoveryVerifier($code);
        }

        $factor->fill([
            'recovery_set_id' => (string) Str::uuid(),
            'recovery_set_created_at' => $created,
            'recovery_codes' => array_values($codes),
        ])->save();

        return [
            'session' => $this->session->projection($this->user),
            'recovery_set' => [
                'id' => $factor->recovery_set_id,
                'codes' => array_keys($codes),
                'created_at' => $created->toISOString(),
                'expires_at' => $created->addDays(365)->toISOString(),
            ],
        ];
    }

    private function consumeRecoveryCode(UserMfaCredential $factor, #[\SensitiveParameter] string $code): void
    {
        $wanted = $this->recoveryVerifier($code);
        $codes = $factor->recovery_codes ?? [];
        $remaining = array_values(array_filter($codes, fn (string $hash) => ! hash_equals($hash, $wanted)));
        if (! $factor->recovery_set_created_at?->addDays(365)->isFuture() || count($remaining) === count($codes)) {
            $this->invalidFactor();
        }

        $factor->recovery_codes = $remaining;
        BrowserMfaReceipt::eraseDelivery($factor->recovery_set_id);
    }

    private function recoveryVerifier(#[\SensitiveParameter] string $code): string
    {
        return hash_hmac('sha256', 'recovery:'.$this->user->id.':'.$code, app('encrypter')->getKey());
    }

    private function acceptTotp(UserMfaCredential $factor, #[\SensitiveParameter] string $code): array
    {
        if ($factor->encrypted_seed === null) {
            $this->invalidFactor();
        }

        $authenticator = TOTP::createFromSecret($factor->encrypted_seed);
        $step = intdiv(now()->timestamp, 30);
        $accepted = $factor->accepted_totp_steps ?? [];
        $matches = [];
        foreach ([$step - 1, $step, $step + 1] as $candidate) {
            if (hash_equals($authenticator->at($candidate * 30), $code)) {
                $matches[] = $candidate;
            }
        }

        if ($matches === [] || array_intersect($matches, $accepted)) {
            $this->invalidFactor();
        }

        // Retain all accepted steps that can still overlap a three-step verifier window.
        $accepted = array_merge($accepted, $matches);
        $oldest = max($accepted) - 2;
        if (min($matches) < $oldest) {
            $this->invalidFactor();
        }

        return array_values(array_filter($accepted, fn (int $acceptedStep) => $acceptedStep >= $oldest));
    }

    private function requirePassword(#[\SensitiveParameter] string $password): void
    {
        if (! ($this->verifyPassword)($password, $this->user)) {
            $this->invalidFactor();
        }
    }

    private function invalidFactor(): never
    {
        throw new MfaDenied(403, 'invalid_factor', 'Authentication proof was not accepted.');
    }
}
