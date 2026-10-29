<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class MfaChallenges
{
    public function __construct(
        private BrowserSessions $sessions,
        private AuthenticatorProofs $proofs,
        private SessionContract $contract,
        private SignInThrottle $throttle,
    ) {}

    public function verify(Request $request): JsonResponse
    {
        return $this->transition($request, false);
    }

    public function regenerate(Request $request): JsonResponse
    {
        return $this->transition($request, true);
    }

    private function transition(Request $request, bool $regenerate): JsonResponse
    {
        $receivedAt = CarbonImmutable::now('UTC');
        $limited = $this->throttle->throttleIp($request, $this->contract, 'mfa');
        if ($limited !== null) {
            return $limited;
        }
        $body = json_decode($request->getContent(), true);
        $fields = $regenerate ? ['password', 'authenticator_code'] : (($body['method'] ?? null) === 'recovery_code'
            ? ['challenge_id', 'method', 'recovery_code'] : ['challenge_id', 'method', 'authenticator_code']);
        $errors = [];
        foreach ($fields as $field) {
            $value = $body[$field] ?? null;
            if (! is_string($value) || match ($field) {
                'password' => $value === '',
                'challenge_id' => ! preg_match('/^chl_[A-Za-z0-9_-]{32,96}$/D', $value),
                'method' => ! in_array($value, ['authenticator', 'recovery_code'], true),
                'recovery_code' => ! preg_match('/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/D', $value),
                default => ! preg_match('/^[0-9]{6}$/D', $value),
            }) {
                $errors[] = $field;
            }
        }
        if (! $request->isJson() || ! is_array($body) || array_diff(array_keys($body), $fields) !== []) {
            $errors[] = $regenerate ? 'password' : 'challenge_id';
        }
        if ($errors !== []) {
            return response()->json(['code' => 'invalid_input', 'message' => 'Check the submitted fields.',
                'field_errors' => array_map(fn (string $field): array => ['pointer' => '/'.$field,
                    'code' => 'invalid', 'message' => 'Check this field.'], array_values(array_unique($errors)))], 422);
        }

        return $this->sessions->withTransactionProtection($request, function () use ($request, $body, $regenerate, $receivedAt): JsonResponse {
            return DB::transaction(function () use ($request, $body, $regenerate, $receivedAt): JsonResponse {
                // One identity lock serializes proof use across all of its sessions.
                $user = DB::table('users')->where('id', $request->session()->get('identity_id'))->lockForUpdate()->first();
                $snapshot = $this->sessions->snapshot($request);
                if ($user === null || $snapshot['state'] === 'signed_out') {
                    return $this->contract->failure('EnrollmentUnauthorized', 401);
                }
                $limited = $this->throttleIdentity((string) $user->id);
                if ($limited !== null) {
                    return $limited;
                }
                $challenge = $request->session()->get('mfa_challenge');
                $now = CarbonImmutable::now('UTC');
                if ($regenerate) {
                    if ($snapshot['state'] !== 'authenticated' || ($snapshot['mfa']['status'] ?? null) !== 'verified'
                        || $user->mfa_confirmed_at === null || $user->mfa_secret_ciphertext === null
                        || ! DB::table('sessions')->where('id', $request->session()->getId())->exists()) {
                        return $this->contract->failure('SessionForbidden', 403, 'forbidden');
                    }
                    // Freshness is measured from this request, never a cached session flag or caller timestamp.
                    if ($now->greaterThanOrEqualTo($receivedAt->addMinutes(5))) {
                        return $this->contract->failure('RecentProofRequired', 409);
                    }
                    if (! $this->sessions->passwordMatches($body['password'], $user->password_hash)) {
                        return $this->rejectProof((string) $user->id, null);
                    }
                } elseif ($snapshot['state'] !== 'mfa_challenge_required' || $challenge === null
                    || $challenge['id'] !== $body['challenge_id'] || $now->greaterThanOrEqualTo($challenge['expires_at'])
                    || ! DB::table('sessions')->where('id', $request->session()->getId())->exists()) {
                    return $this->contract->failure('ChallengeUnavailable', 409);
                }
                if (! $regenerate) {
                    $limited = $this->throttleChallenge($challenge, $now);
                    if ($limited !== null) {
                        return $limited;
                    }
                }
                if (! $regenerate && $body['method'] === 'recovery_code') {
                    $consumed = DB::table('user_recovery_codes')->where('user_id', $user->id)
                        ->where('code_hash', hash('sha256', $body['recovery_code'], true))->whereNull('used_at')
                        ->update(['used_at' => $now]);
                    if ($consumed !== 1) {
                        return $this->rejectProof((string) $user->id, $body['challenge_id']);
                    }
                } else {
                    if (! $this->proofs->accepts($user->mfa_secret_ciphertext, $body['authenticator_code'], $now,
                        $user->mfa_last_used_step === null ? null : (int) $user->mfa_last_used_step)) {
                        return $this->rejectProof((string) $user->id, $regenerate ? null : $body['challenge_id']);
                    }
                    DB::table('users')->where('id', $user->id)->update(['mfa_last_used_step' => intdiv($now->getTimestamp(), 30)]);
                }
                $codes = null;
                if ($regenerate) {
                    DB::table('user_recovery_codes')->where('user_id', $user->id)->delete();
                    $codes = $this->proofs->issueCodes((string) $user->id, $now);
                }
                DB::table('global_security_events')->insert(['user_id' => $user->id,
                    'event_code' => $regenerate ? 'recovery_codes_regenerated' : 'mfa_challenge_verified',
                    'operator_reference' => 'authenticated_identity', 'occurred_at' => $now,
                    'details' => json_encode($regenerate ? ['recovery_code_count' => 10] : ['method' => $body['method']], JSON_THROW_ON_ERROR)]);
                $this->sessions->commitVerifiedMfa($request, $now->format('Y-m-d\TH:i:s.u\Z'));

                $snapshot = $this->sessions->snapshot($request);

                return response()->json($regenerate ? ['session' => $snapshot,
                    'recovery_codes' => ['issued_at' => $now->format('Y-m-d\TH:i:s.u\Z'), 'codes' => $codes]] : $snapshot);
            });
        });
    }

    // Call only with the identity locked. The budget outlives every five-minute challenge.
    private function throttleIdentity(string $userId): ?JsonResponse
    {
        $key = hash('sha256', 'mfa-identity:'.$userId);
        $now = time();
        DB::table('session_throttles')->insertOrIgnore(['key' => $key, 'attempts' => 0, 'expires_at' => $now + 900]);
        $counter = DB::table('session_throttles')->where('key', $key)->lockForUpdate()->first();
        if ($counter->expires_at <= $now) {
            DB::table('session_throttles')->where('key', $key)->update(['attempts' => 0, 'expires_at' => $now + 900]);
        } elseif ($counter->attempts >= 5) {
            return $this->contract->failure('SessionThrottled', 429)
                ->header('Retry-After', (string) ($counter->expires_at - $now));
        }

        return null;
    }

    /** @param array{id: string, expires_at: string} $challenge */
    private function throttleChallenge(array $challenge, CarbonImmutable $now): ?JsonResponse
    {
        $key = hash('sha256', 'mfa-challenge:'.$challenge['id']);
        $until = CarbonImmutable::parse($challenge['expires_at']);
        DB::table('session_throttles')->insertOrIgnore(['key' => $key, 'attempts' => 0,
            'expires_at' => $until->getTimestamp()]);
        $counter = DB::table('session_throttles')->where('key', $key)->lockForUpdate()->first();
        // A challenge never regains attempts, even when its identity's older window expires.
        if ($counter->attempts >= 5) {
            return $this->contract->failure('SessionThrottled', 429)
                ->header('Retry-After', (string) max(1, $until->getTimestamp() - $now->getTimestamp()));
        }

        return null;
    }

    private function rejectProof(string $userId, ?string $challengeId): JsonResponse
    {
        DB::table('session_throttles')->where('key', hash('sha256', 'mfa-identity:'.$userId))->increment('attempts');
        if ($challengeId !== null) {
            DB::table('session_throttles')->where('key', hash('sha256', 'mfa-challenge:'.$challengeId))->increment('attempts');
        }

        return $this->contract->failure('MfaProofRejected', 400);
    }
}
