<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use OTPHP\InternalClock;
use OTPHP\TOTP;
use ParagonIE\ConstantTime\Base32;
use RuntimeException;
use Throwable;

final class AuthenticatorEnrollments
{
    private const IP_ATTEMPT_LIMIT = 60;

    private const IP_WINDOW_SECONDS = 900;

    public function __construct(private BrowserSessions $sessions, private CurrentAuthority $authority, private SessionContract $contract) {}

    public function prepare(Request $request): JsonResponse
    {
        return $this->transition($request, false);
    }

    public function confirm(Request $request): JsonResponse
    {
        return $this->transition($request, true);
    }

    private function transition(Request $request, bool $confirm): JsonResponse
    {
        $limited = $this->throttleIp($request);
        if ($limited !== null) {
            return $limited;
        }
        $body = json_decode($request->getContent(), true);
        $errors = $this->invalidFields($body, $confirm);
        if (! $request->isJson() || $errors !== []) {
            return response()->json(['code' => 'invalid_input', 'message' => 'Check the submitted fields.',
                'field_errors' => array_map(fn (string $field): array => ['pointer' => '/'.$field,
                    'code' => 'invalid', 'message' => 'Check this field.'], $errors ?: [$confirm ? 'enrollment_id' : 'intent'])], 422);
        }

        $originalSessionId = $request->session()->getId();
        $originalSession = $request->session()->all();
        try {
            return DB::transaction(function () use ($request, $confirm, $body): JsonResponse {
                // Every transition locks the identity first, including first preparation.
                $user = DB::table('users')->where('id', $request->session()->get('identity_id'))->lockForUpdate()->first();
                $state = $this->sessions->snapshot($request)['state'];
                if ($user === null || $state === 'signed_out') {
                    return $this->contract->failure('EnrollmentUnauthorized', 401);
                }
                if ($user->mfa_confirmed_at !== null || $user->mfa_secret_ciphertext !== null) {
                    return $this->contract->failure('EnrollmentConflict', 409);
                }
                if ($state !== 'mfa_enrollment_required' || ! $this->authority->requiresMfa((string) $user->id)) {
                    return $this->contract->failure('SessionForbidden', 403, 'forbidden');
                }
                $enrollment = DB::table('authenticator_enrollments')->where('user_id', $user->id)->lockForUpdate()->first();
                $now = CarbonImmutable::now('UTC');
                $binding = hash('sha256', $request->session()->getId());
                if ($confirm) {
                    if ($enrollment === null || $enrollment->enrollment_id !== $body['enrollment_id']
                        || ! hash_equals($enrollment->session_binding, $binding)
                        || $enrollment->auth_version !== $user->auth_version || $enrollment->consumed_at !== null
                        || $now->greaterThanOrEqualTo($enrollment->expires_at)) {
                        return $this->contract->failure('EnrollmentConflict', 409);
                    }
                    if ($enrollment->failed_attempts >= 5) {
                        return $this->throttled($enrollment->attempt_window_expires_at);
                    }
                    // Bounded skew: current 30-second step only.
                    if (! app(AuthenticatorProofs::class)->accepts($enrollment->secret_ciphertext, $body['authenticator_code'], $now)) {
                        DB::table('authenticator_enrollments')->where('user_id', $user->id)->increment('failed_attempts');

                        return $this->contract->failure('EnrollmentProofRejected', 400);
                    }
                    DB::table('users')->where('id', $user->id)->update([
                        'mfa_secret_ciphertext' => $enrollment->secret_ciphertext, 'mfa_confirmed_at' => $now,
                        'mfa_last_used_step' => intdiv($now->getTimestamp(), 30),
                    ]);
                    DB::table('authenticator_enrollments')->where('user_id', $user->id)->update([
                        'consumed_at' => $now, 'secret_ciphertext' => null,
                    ]);
                    $codes = app(AuthenticatorProofs::class)->issueCodes((string) $user->id, $now);
                    DB::table('global_security_events')->insert(['user_id' => $user->id,
                        'event_code' => 'authenticator_confirmed', 'operator_reference' => 'authenticated_identity',
                        'occurred_at' => $now, 'details' => json_encode(['recovery_code_count' => 10], JSON_THROW_ON_ERROR)]);
                    $this->sessions->verifyMfa($request, $now->format('Y-m-d\TH:i:s.u\Z'));
                    // Persist rotated state in this transaction, before any response can disclose codes.
                    $request->session()->save();
                    // Laravel's database handler can swallow a failed INSERT and update
                    // zero rows. Do not commit confirmation without the rotated session.
                    if (! DB::table('sessions')->where('id', $request->session()->getId())->exists()) {
                        throw new RuntimeException('Verified session was not persisted.');
                    }

                    return response()->json(['session' => $this->sessions->snapshot($request),
                        'recovery_codes' => ['issued_at' => $now->format('Y-m-d\TH:i:s.u\Z'), 'codes' => $codes]]);
                }
                if ($body['intent'] === 'begin' && $enrollment !== null && $now->lessThan($enrollment->expires_at)) {
                    return $this->contract->failure('EnrollmentConflict', 409);
                }
                if ($body['intent'] === 'replace_unconfirmed'
                    && ($enrollment === null || $enrollment->enrollment_id !== $body['enrollment_id']
                        || $enrollment->consumed_at !== null || ! hash_equals($enrollment->session_binding, $binding)
                        || $enrollment->auth_version !== $user->auth_version
                        || $now->greaterThanOrEqualTo($enrollment->expires_at))) {
                    return $this->contract->failure('EnrollmentConflict', 409);
                }
                // Replacement preserves the identity's failed-proof budget for a bounded 15-minute window.
                $inWindow = $enrollment !== null && $now->lessThan($enrollment->attempt_window_expires_at);
                if ($inWindow && $enrollment->failed_attempts >= 5) {
                    return $this->throttled($enrollment->attempt_window_expires_at);
                }
                $secret = rtrim(Base32::encodeUpper(random_bytes(20)), '=');
                $totp = TOTP::createFromSecret($secret, new InternalClock);
                $totp->setLabel('identity-'.$user->id);
                $totp->setIssuer('YSP');
                $id = 'enr_'.bin2hex(random_bytes(32));
                $expiry = $now->addMinutes(10);
                DB::table('authenticator_enrollments')->updateOrInsert(['user_id' => $user->id], [
                    'enrollment_id' => $id, 'session_binding' => $binding, 'auth_version' => $user->auth_version,
                    'secret_ciphertext' => Crypt::encryptString($secret), 'created_at' => $now, 'expires_at' => $expiry,
                    'failed_attempts' => $inWindow ? $enrollment->failed_attempts : 0,
                    'attempt_window_expires_at' => $inWindow ? $enrollment->attempt_window_expires_at : $now->addMinutes(15),
                    'consumed_at' => null,
                ]);

                return response()->json(['state' => 'mfa_enrollment_required', 'enrollment' => [
                    'id' => $id, 'expires_at' => $expiry->format('Y-m-d\TH:i:s.u\Z'),
                    'setup_uri' => $totp->getProvisioningUri(), 'manual_key' => $secret,
                ]]);
            });
        } catch (Throwable $failure) {
            // Middleware may save again while unwinding a failed request. Restore
            // the pre-transaction attributes so rolled-back MFA cannot leak into it.
            $request->session()->setId($originalSessionId);
            $request->session()->flush();
            $request->session()->put($originalSession);
            throw $failure;
        }
    }

    public function throttleIp(Request $request, string $scope = 'enrollment'): ?JsonResponse
    {
        // Commit the IP counter before entering the identity transaction: independent
        // identities do not hold a network-wide lock throughout proof verification.
        return DB::transaction(function () use ($request, $scope): ?JsonResponse {
            $key = hash('sha256', $scope.'-ip:'.$request->ip());
            $now = time();
            DB::table('session_throttles')->insertOrIgnore([
                'key' => $key, 'attempts' => 0, 'expires_at' => $now + self::IP_WINDOW_SECONDS,
            ]);
            $counter = DB::table('session_throttles')->where('key', $key)->lockForUpdate()->first();
            if ($counter->expires_at <= $now) {
                $counter->attempts = 0;
                $counter->expires_at = $now + self::IP_WINDOW_SECONDS;
                DB::table('session_throttles')->where('key', $key)->update([
                    'attempts' => 0, 'expires_at' => $counter->expires_at,
                ]);
            }
            if ($counter->attempts >= self::IP_ATTEMPT_LIMIT) {
                return $this->contract->failure('SessionThrottled', 429)
                    ->header('Retry-After', (string) ($counter->expires_at - $now));
            }
            DB::table('session_throttles')->where('key', $key)->increment('attempts');

            return null;
        });
    }

    private function throttled(string $until): JsonResponse
    {
        return $this->contract->failure('SessionThrottled', 429)
            ->header('Retry-After', (string) max(1, CarbonImmutable::parse($until, 'UTC')->getTimestamp() - time()));
    }

    /** @return list<string> */
    private function invalidFields(mixed $body, bool $confirm): array
    {
        if (! is_array($body)) {
            return [$confirm ? 'enrollment_id' : 'intent'];
        }
        $fields = $confirm ? ['enrollment_id', 'authenticator_code']
            : (($body['intent'] ?? '') === 'begin' ? ['intent'] : ['intent', 'enrollment_id']);
        $errors = [];
        foreach ($fields as $field) {
            $value = $body[$field] ?? null;
            if (! is_string($value) || match ($field) {
                'intent' => ! in_array($value, ['begin', 'replace_unconfirmed'], true),
                'enrollment_id' => ! preg_match('/^enr_[A-Za-z0-9_-]{32,96}$/D', $value),
                default => ! preg_match('/^[0-9]{6}$/D', $value),
            }) {
                $errors[] = $field;
            }
        }
        if (array_diff(array_keys($body), $fields) !== []) {
            $errors[] = $fields[0];
        }

        return array_values(array_unique($errors));
    }
}
