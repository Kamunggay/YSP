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
        $limited = $this->throttle->throttleIp($request, $this->contract, 'mfa');
        if ($limited !== null) {
            return $limited;
        }

        $body = json_decode($request->getContent(), true);
        if (! $request->isJson() || ! is_array($body)) {
            return response()->json([
                'code' => 'invalid_input',
                'message' => 'Check the submitted fields.',
                'field_errors' => [['pointer' => '/challenge_id', 'code' => 'invalid', 'message' => 'Check this field.']],
            ], 422);
        }

        $fields = ($body['method'] ?? null) === 'recovery_code'
            ? ['challenge_id', 'method', 'recovery_code']
            : ['challenge_id', 'method', 'authenticator_code'];

        $errors = [];
        foreach ($fields as $field) {
            $value = $body[$field] ?? null;
            if (! is_string($value) || match ($field) {
                'challenge_id' => ! preg_match('/^chl_[A-Za-z0-9_-]{32,96}$/D', $value),
                'method' => ! in_array($value, ['authenticator', 'recovery_code'], true),
                'recovery_code' => ! preg_match('/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/D', $value),
                default => ! preg_match('/^[0-9]{6}$/D', $value),
            }) {
                $errors[] = $field;
            }
        }
        foreach (array_diff(array_keys($body), $fields) as $extraField) {
            $errors[] = in_array($extraField, ['authenticator_code', 'recovery_code', 'method'], true)
                ? $extraField
                : 'challenge_id';
        }
        if ($errors !== []) {
            return response()->json([
                'code' => 'invalid_input',
                'message' => 'Check the submitted fields.',
                'field_errors' => array_map(fn (string $field): array => [
                    'pointer' => '/'.$field,
                    'code' => 'invalid',
                    'message' => 'Check this field.',
                ], array_values(array_unique($errors))),
            ], 422);
        }

        return $this->sessions->withTransactionProtection($request, function () use ($request, $body): JsonResponse {
            return DB::transaction(function () use ($request, $body): JsonResponse {
                // One identity lock serializes proof use across all of its sessions.
                $user = DB::table('users')->where('id', $request->session()->get('identity_id'))->lockForUpdate()->first();
                $snapshot = $this->sessions->snapshot($request);
                if ($user === null || $snapshot['state'] === 'signed_out') {
                    return $this->contract->failure('EnrollmentUnauthorized', 401);
                }
                $limited = $this->throttle->throttleMfaIdentity((string) $user->id, $this->contract);
                if ($limited !== null) {
                    return $limited;
                }
                $challenge = $request->session()->get('mfa_challenge');
                $now = CarbonImmutable::now('UTC');
                if ($snapshot['state'] !== 'mfa_challenge_required' || $challenge === null
                    || $challenge['id'] !== $body['challenge_id'] || $now->greaterThanOrEqualTo($challenge['expires_at'])
                    || ! $this->sessions->sessionExists($request)) {
                    return $this->contract->failure('ChallengeUnavailable', 409);
                }

                $limited = $this->throttle->throttleMfaChallenge($challenge, $now, $this->contract);
                if ($limited !== null) {
                    return $limited;
                }

                if ($body['method'] === 'recovery_code') {
                    $consumed = DB::table('user_recovery_codes')->where('user_id', $user->id)
                        ->where('code_hash', hash('sha256', $body['recovery_code'], true))->whereNull('used_at')
                        ->update(['used_at' => $now]);
                    if ($consumed !== 1) {
                        return $this->throttle->recordMfaProofRejection((string) $user->id, $body['challenge_id'], $this->contract);
                    }
                } else {
                    if (! $this->proofs->accepts(
                        $user->mfa_secret_ciphertext,
                        $body['authenticator_code'],
                        $now,
                        $user->mfa_last_used_step === null ? null : (int) $user->mfa_last_used_step
                    )) {
                        return $this->throttle->recordMfaProofRejection((string) $user->id, $body['challenge_id'], $this->contract);
                    }
                    DB::table('users')->where('id', $user->id)->update(['mfa_last_used_step' => intdiv($now->getTimestamp(), 30)]);
                }

                DB::table('global_security_events')->insert([
                    'user_id' => $user->id,
                    'event_code' => 'mfa_challenge_verified',
                    'operator_reference' => 'authenticated_identity',
                    'occurred_at' => $now,
                    'details' => json_encode(['method' => $body['method']], JSON_THROW_ON_ERROR),
                ]);
                $this->sessions->commitVerifiedMfa($request, $now->format('Y-m-d\TH:i:s.u\Z'));

                return response()->json($this->sessions->snapshot($request));
            });
        });
    }

    public function regenerate(Request $request): JsonResponse
    {
        $receivedAt = CarbonImmutable::now('UTC');
        $limited = $this->throttle->throttleIp($request, $this->contract, 'mfa');
        if ($limited !== null) {
            return $limited;
        }

        $body = json_decode($request->getContent(), true);
        if (! $request->isJson() || ! is_array($body)) {
            return response()->json([
                'code' => 'invalid_input',
                'message' => 'Check the submitted fields.',
                'field_errors' => [['pointer' => '/password', 'code' => 'invalid', 'message' => 'Check this field.']],
            ], 422);
        }

        $fields = ['password', 'authenticator_code'];
        $errors = [];
        foreach ($fields as $field) {
            $value = $body[$field] ?? null;
            if (! is_string($value) || match ($field) {
                'password' => $value === '',
                default => ! preg_match('/^[0-9]{6}$/D', $value),
            }) {
                $errors[] = $field;
            }
        }
        if (array_diff(array_keys($body), $fields) !== []) {
            $errors[] = 'password';
        }
        if ($errors !== []) {
            return response()->json([
                'code' => 'invalid_input',
                'message' => 'Check the submitted fields.',
                'field_errors' => array_map(fn (string $field): array => [
                    'pointer' => '/'.$field,
                    'code' => 'invalid',
                    'message' => 'Check this field.',
                ], array_values(array_unique($errors))),
            ], 422);
        }

        return $this->sessions->withTransactionProtection($request, function () use ($request, $body, $receivedAt): JsonResponse {
            return DB::transaction(function () use ($request, $body, $receivedAt): JsonResponse {
                // One identity lock serializes proof use across all of its sessions.
                $user = DB::table('users')->where('id', $request->session()->get('identity_id'))->lockForUpdate()->first();
                $snapshot = $this->sessions->snapshot($request);
                if ($user === null || $snapshot['state'] === 'signed_out') {
                    return $this->contract->failure('EnrollmentUnauthorized', 401);
                }
                $limited = $this->throttle->throttleMfaIdentity((string) $user->id, $this->contract);
                if ($limited !== null) {
                    return $limited;
                }

                $now = CarbonImmutable::now('UTC');
                if ($snapshot['state'] !== 'authenticated' || ($snapshot['mfa']['status'] ?? null) !== 'verified'
                    || $user->mfa_confirmed_at === null || $user->mfa_secret_ciphertext === null
                    || ! $this->sessions->sessionExists($request)) {
                    return $this->contract->failure('SessionForbidden', 403, 'forbidden');
                }
                // Freshness is measured from this request, never a cached session flag or caller timestamp.
                if ($now->greaterThanOrEqualTo($receivedAt->addMinutes(5))) {
                    return $this->contract->failure('RecentProofRequired', 409);
                }
                if (! $this->sessions->passwordMatches($body['password'], $user->password_hash)) {
                    return $this->throttle->recordMfaProofRejection((string) $user->id, null, $this->contract);
                }

                if (! $this->proofs->accepts(
                    $user->mfa_secret_ciphertext,
                    $body['authenticator_code'],
                    $now,
                    $user->mfa_last_used_step === null ? null : (int) $user->mfa_last_used_step
                )) {
                    return $this->throttle->recordMfaProofRejection((string) $user->id, null, $this->contract);
                }
                DB::table('users')->where('id', $user->id)->update(['mfa_last_used_step' => intdiv($now->getTimestamp(), 30)]);

                DB::table('user_recovery_codes')->where('user_id', $user->id)->delete();
                $codes = $this->proofs->issueCodes((string) $user->id, $now);

                DB::table('global_security_events')->insert([
                    'user_id' => $user->id,
                    'event_code' => 'recovery_codes_regenerated',
                    'operator_reference' => 'authenticated_identity',
                    'occurred_at' => $now,
                    'details' => json_encode(['recovery_code_count' => 10], JSON_THROW_ON_ERROR),
                ]);
                $this->sessions->commitVerifiedMfa($request, $now->format('Y-m-d\TH:i:s.u\Z'));

                return response()->json([
                    'session' => $this->sessions->snapshot($request),
                    'recovery_codes' => [
                        'issued_at' => $now->format('Y-m-d\TH:i:s.u\Z'),
                        'codes' => $codes,
                    ],
                ]);
            });
        });
    }

    public function assistedRecovery(Request $request): JsonResponse
    {
        $snapshot = $this->sessions->snapshot($request);
        if ($snapshot['state'] === 'signed_out') {
            return $this->contract->failure('EnrollmentUnauthorized', 401);
        }

        return response()->json([
            'availability' => 'unavailable',
            'blocker' => 'assisted_recovery_not_approved',
            'message' => 'Assisted recovery is unavailable until an authorized proof and reset procedure is approved.',
            'next_actions' => [
                'bootstrap_session',
                'sign_out',
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }
}
