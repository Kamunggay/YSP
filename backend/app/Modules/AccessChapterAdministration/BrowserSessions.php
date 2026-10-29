<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

final class BrowserSessions
{
    public function __construct(private CurrentAuthority $authority) {}

    public function verifyMfa(Request $request, string $verifiedAt): void
    {
        $request->session()->regenerate(true);
        $request->session()->regenerateToken();
        $request->session()->forget('mfa_challenge');
        $request->session()->put('mfa_verified_at', $verifiedAt);
    }

    public function sessionExists(Request $request): bool
    {
        return DB::table('sessions')->where('id', $request->session()->getId())->exists();
    }

    public function commitVerifiedMfa(Request $request, string $verifiedAt): void
    {
        $this->verifyMfa($request, $verifiedAt);
        // Persist rotated state in this transaction, before any response can disclose codes.
        $request->session()->save();
        // Laravel's database handler can swallow a failed INSERT and update
        // zero rows. Do not commit confirmation without the rotated session.
        if (! $this->sessionExists($request)) {
            throw new RuntimeException('Verified session was not persisted.');
        }
    }

    /**
     * Executes a transactional callback with protection against session mutation leakage on failure.
     *
     * @template T
     *
     * @param  Closure(): T  $callback
     * @return T
     */
    public function withTransactionProtection(Request $request, Closure $callback): mixed
    {
        $originalSessionId = $request->session()->getId();
        $originalSession = $request->session()->all();
        try {
            return $callback();
        } catch (Throwable $failure) {
            // Middleware may save again while unwinding a failed request. Restore
            // the pre-transaction attributes so rolled-back MFA cannot leak into it.
            $request->session()->setId($originalSessionId);
            $request->session()->flush();
            $request->session()->put($originalSession);
            throw $failure;
        }
    }

    public function cycleSession(Request $request): void
    {
        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }

    public function passwordMatches(string $password, string $hash): bool
    {
        return password_verify($password, $hash) && strlen($password) <= 72;
    }

    /** @return array<string, mixed>|null */
    public function signIn(Request $request, string $email, string $password): ?array
    {
        $user = DB::table('users')->where('email_key', strtolower(trim($email)))->first();
        // The dummy verifier keeps nonexistent and disabled logins on the hashing path.
        $cost = (int) env('BCRYPT_ROUNDS', app()->environment('production') ? 12 : 4);
        $dummyCost = sprintf('%02d', $cost);
        $hash = $user->password_hash ?? "\$2y\${$dummyCost}\$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.";
        $matches = $this->passwordMatches($password, $hash);
        if (! $matches || $user === null || $user->status !== 'active') {
            return null;
        }
        $this->cycleSession($request);
        $request->session()->put([
            'identity_id' => (string) $user->id, 'auth_version' => $user->auth_version,
            'signed_in_at' => time(),
        ]);

        return $this->snapshot($request);
    }

    /** @return array<string, mixed> */
    public function snapshot(Request $request): array
    {
        $id = $request->session()->get('identity_id');
        $user = $id === null ? null : DB::table('users')->where('id', $id)->first();
        if ($user === null || $user->status !== 'active'
            || $user->auth_version !== $request->session()->get('auth_version')
            || time() - (int) $request->session()->get('signed_in_at', 0) >= 28800) {
            if ($id !== null) {
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return ['state' => 'signed_out'];
        }
        if ($this->authority->requiresMfa((string) $user->id) && ! $request->session()->has('mfa_verified_at')) {
            if (! $request->session()->get('mfa_required', false)) {
                $request->session()->regenerate(true);
                $request->session()->regenerateToken();
                $request->session()->put('mfa_required', true);
            }
            if ($user->mfa_confirmed_at !== null && $user->mfa_secret_ciphertext !== null) {
                if (! $request->session()->has('mfa_challenge')) {
                    $request->session()->put('mfa_challenge', [
                        'id' => 'chl_'.bin2hex(random_bytes(32)),
                        'expires_at' => now()->addMinutes(5)->format('Y-m-d\TH:i:s.u\Z'),
                    ]);
                }

                return ['state' => 'mfa_challenge_required', 'challenge' => $request->session()->get('mfa_challenge')];
            }

            return ['state' => 'mfa_enrollment_required'];
        }
        $request->session()->forget(['mfa_required', 'mfa_challenge']);

        return ['state' => 'authenticated',
            'user' => ['id' => (string) $user->id, 'display_name' => $user->name],
            'mfa' => $request->session()->has('mfa_verified_at')
                ? ['status' => 'verified', 'verified_at' => $request->session()->get('mfa_verified_at')]
                : ['status' => 'not_required'], 'provider_destinations' => []];
    }
}
