<?php

namespace App\Http\Controllers;

use App\Http\Requests\AuthInput;
use App\Models\BrowserSession;
use App\Models\User;
use App\Services\BrowserMfa;
use App\Services\MfaDenied;
use Closure;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Encryption\MissingAppKeyException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use JsonException;
use PDOException;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;

class BrowserSessionController extends Controller
{
    public function csrf(Request $request): Response
    {
        return $this->handle($request, function (?BrowserSession $session, ?string $token) use ($request) {
            if ($request->getContent() !== '') {
                return $this->malformed();
            }

            if (! $session || ($session->user_id && ! $session->currentUser())) {
                $session?->clearPendingEnrollment();
                $session?->delete();
                $session = new BrowserSession(['expires_at' => now()->addHours(2)]);
                $token = $session->rotateToken();
                $session->save();
            }

            return $this->cookies(response()->noContent(), $token, $session->csrf_token);
        }, checkOrigin: true);
    }

    public function signIn(Request $request): Response
    {
        return $this->handle($request, function (BrowserSession $session, string $token, ?int $ipDelay) use ($request) {
            if ($ipDelay === null && $session->user_id && ! $session->refreshProgress($session->currentUser())) {
                return $this->invalidCredentials();
            }

            if (strtolower(trim(explode(';', $request->header('Content-Type', ''))[0])) !== 'application/json') {
                return $this->failure(415, 'unsupported_media_type', 'Use application/json.');
            }
            $body = AuthInput::decode($request);

            if ($fields = AuthInput::errors($body)) {
                return $this->failure(422, 'invalid_input', 'Correct the indicated fields.', $fields);
            }

            $secret = app('encrypter')->getKey();
            $login = mb_strtolower($body->login);
            $loginDelay = $this->attempt('login:'.hash_hmac('sha256', $login, $secret), 5, countAttempt: $ipDelay === null);
            if ($ipDelay || $loginDelay) {
                return $this->throttled(max($ipDelay, $loginDelay));
            }

            $key = $request->header('X-Action-Key');
            $fingerprint = hash_hmac('sha256', json_encode([$body->login, $body->password], JSON_THROW_ON_ERROR), $secret);
            if ($session->user_id) {
                $receipt = $session->sign_in_receipt;
                if ($receipt && $receipt['key'] === $key) {
                    if (! hash_equals($receipt['fingerprint'], $fingerprint)) {
                        return $this->failure(409, 'action_key_conflict', 'Use a new action key for changed input.');
                    }

                    return $this->sessionEstablished($receipt['result'], $token, $session->csrf_token, true);
                }

                return $this->failure(409, 'session_state_conflict', 'Review the current session before starting another intent.');
            }

            $account = User::whereIn('status', ['active', 'enabled']);
            $user = ($account->getConnection()->getDriverName() === 'sqlite'
                ? $account->whereRaw('LOWER(email) = ?', [$login])
                : $account->where('email', $login))->sharedLock()->first();
            if ($user && mb_strtolower($user->email) !== $login) {
                $user = null;
            }
            if (! $this->validPassword($body->password, $user)) {
                return $this->invalidCredentials();
            }

            [$result, $token] = $session->acceptPassword($user, $key, $fingerprint);

            return $this->sessionEstablished($result, $token, $session->csrf_token, false);
        }, checkLoginLimit: true);
    }

    public function session(Request $request): Response
    {
        return $this->handle($request, function (?BrowserSession $session) use ($request) {
            $user = $session?->currentUser();
            if (! $user) {
                $session?->refreshProgress(null);

                return $this->failure(401, 'unauthenticated', 'Sign in again.');
            }
            if ($request->getQueryString() !== null || $request->getContent() !== '') {
                return $this->malformed();
            }

            $session->refreshProgress($user);

            return response()->json(['data' => $session->projection($user)]);
        });
    }

    public function signOut(Request $request): Response
    {
        return $this->handle($request, function (BrowserSession $session) use ($request) {
            if ($request->getContent() !== '') {
                return $this->malformed();
            }

            $session->clearPendingEnrollment();
            $session->delete();

            return $this->cookies(response()->noContent(), null, null);
        });
    }

    public function beginEnrollment(Request $request): Response
    {
        return $this->mfa($request, 'begin');
    }

    public function confirmEnrollment(Request $request): Response
    {
        return $this->mfa($request, 'confirm');
    }

    public function completeAuthenticatorChallenge(Request $request): Response
    {
        return $this->mfa($request, 'authenticator');
    }

    public function completeRecoveryChallenge(Request $request): Response
    {
        return $this->mfa($request, 'recovery');
    }

    public function recoveryCodes(Request $request): Response
    {
        return $this->mfa($request, 'status');
    }

    public function rotateRecoveryCodes(Request $request): Response
    {
        return $this->mfa($request, 'rotate');
    }

    private function mfa(Request $request, string $operation): Response
    {
        return $this->handle($request, function (?BrowserSession $session, ?string $token, ?int $ipDelay) use ($request, $operation) {
            $proof = $operation !== 'status';
            $user = $session?->currentUser(write: $proof && $ipDelay === null);
            if (! $user || ! $session->expires_at->isFuture()) {
                return $this->failure(401, 'unauthenticated', 'Sign in again.');
            }

            if ($ipDelay !== null) {
                return $this->throttled(max($ipDelay, $this->attempt('account:'.$user->id, 5, countAttempt: false)));
            }

            $session->refreshProgress($user);
            $mfa = new BrowserMfa($session, $user, $this->validPassword(...));
            $mfa->eraseExpiredSecrets();
            $mfa->assertAdmission($operation);
            if ($operation === 'status') {
                $status = $mfa->recoveryStatus();
                if ($request->getQueryString() !== null || $request->getContent() !== '') {
                    return $this->malformed();
                }

                return response()->json(['data' => $status]);
            }
            if ($request->getQueryString() !== null || ! $this->validActionKey($request)) {
                return $this->malformed();
            }
            if (strtolower(trim(explode(';', $request->header('Content-Type', ''))[0])) !== 'application/json') {
                return $this->failure(415, 'unsupported_media_type', 'Use application/json.');
            }

            $keys = BrowserMfa::INPUTS[$operation];
            $body = AuthInput::decode($request);
            if ($fields = AuthInput::errors($body, $keys)) {
                return $this->failure(422, 'invalid_input', 'Correct the indicated fields.', $fields);
            }
            if ($delay = $this->attempt('account:'.$user->id, 5)) {
                return $this->throttled($delay);
            }

            $input = array_replace(array_fill_keys($keys, null), (array) $body);
            [$result, $token, $replay] = $mfa->perform($operation, $request->header('X-Action-Key'), $input, $token);

            if (in_array($operation, ['confirm', 'authenticator', 'recovery'], true)) {
                return $this->sessionEstablished($result, $token, $session->csrf_token, $replay);
            }

            return response()->json(['data' => $result], $operation === 'begin' ? 201 : 200, [
                'X-Action-Replayed' => $replay ? 'true' : 'false',
            ]);
        }, protectedMfa: true);
    }

    private function validActionKey(Request $request): bool
    {
        return preg_match(AuthInput::UUID, $request->header('X-Action-Key', '')) === 1;
    }

    private function handle(Request $request, Closure $operation, bool $checkOrigin = false, bool $checkLoginLimit = false, bool $protectedMfa = false): Response
    {
        $unsafe = $request->isMethod('POST');

        try {
            $ipDelay = $this->attempt('ip:'.hash('sha256', (string) $request->ip()), 60);
            if ($ipDelay && ! $checkLoginLimit && ! ($protectedMfa && $unsafe)) {
                return $this->noStore($this->throttled($ipDelay));
            }

            $response = DB::transaction(function () use ($request, $operation, $unsafe, $checkOrigin, $ipDelay, $protectedMfa) {
                foreach (['Origin', 'Referer', 'Sec-Fetch-Site', 'Content-Type', 'X-Action-Key', 'X-XSRF-TOKEN'] as $name) {
                    if (count($request->headers->all($name)) > 1) {
                        return $this->malformed();
                    }
                }
                if (($unsafe || $checkOrigin) && ! $this->originAllowed($request, $unsafe)) {
                    return $this->failure(403, 'origin_denied', 'Browser origin denied.');
                }
                if (! $unsafe && ! $checkOrigin && ! $this->requestMatchesOrigin($request)) {
                    return $this->failure(401, 'unauthenticated', 'Sign in again.');
                }

                $token = $request->cookie('ysp_session');
                $session = is_string($token) && preg_match('/\A[a-f0-9]{64}\z/', $token)
                    ? BrowserSession::where('token_hash', hash('sha256', $token))
                        ->when(! $protectedMfa, fn ($query) => $query->where('expires_at', '>', now()))
                        ->lockForUpdate()->first()
                    : null;

                if ($unsafe && (! $session || ! hash_equals($session->csrf_token, $request->header('X-XSRF-TOKEN', '')))) {
                    return $this->failure(419, 'csrf_mismatch', 'Refresh browser CSRF protection.');
                }
                if ($protectedMfa && $session && ! $session->expires_at->isFuture()) {
                    return $this->failure(401, 'unauthenticated', 'Sign in again.');
                }
                if (! $protectedMfa && ($unsafe || $checkOrigin) && $request->getQueryString() !== null) {
                    return $this->malformed();
                }
                if (! $protectedMfa && $unsafe && ! $this->validActionKey($request)) {
                    return $this->malformed();
                }

                try {
                    return $operation($session, $token, $ipDelay);
                } catch (JsonException) {
                    return $this->malformed();
                } catch (MfaDenied $denied) {
                    return $this->failure($denied->status, $denied->error, $denied->getMessage());
                }
            }, 3);
            if ($ipDelay && $response->getStatusCode() !== 429) {
                $response = $this->throttled($ipDelay);
            }
        } catch (PDOException|MissingAppKeyException|LockTimeoutException|DecryptException) {
            $response = $this->failure(503, 'unavailable', 'Authentication service is unavailable.');
        }

        return $this->noStore($response);
    }

    private function noStore(Response $response): Response
    {
        // Symfony normally adds private, while the contract specifies the literal no-store value.
        $response->headers = new class($response->headers->all() + ['Cache-Control' => 'no-store']) extends ResponseHeaderBag
        {
            protected function computeCacheControlValue(): string
            {
                return 'no-store';
            }
        };

        return $response;
    }

    private function originAllowed(Request $request, bool $unsafe): bool
    {
        $origin = rtrim(config('app.url'), '/');
        if (! $this->requestMatchesOrigin($request)) {
            return false;
        }

        $supplied = $request->header('Origin');
        if ($unsafe || $supplied !== null) {
            return $supplied === $origin && ($unsafe || in_array($request->header('Sec-Fetch-Site'), [null, 'same-origin'], true));
        }

        if ($site = $request->header('Sec-Fetch-Site')) {
            return $site === 'same-origin';
        }

        $referer = parse_url($request->header('Referer', ''));
        if (! isset($referer['scheme'], $referer['host']) || isset($referer['user']) || isset($referer['pass'])) {
            return false;
        }

        $port = isset($referer['port']) ? ':'.$referer['port'] : '';

        return $origin === $referer['scheme'].'://'.$referer['host'].$port;
    }

    private function requestMatchesOrigin(Request $request): bool
    {
        return ($request->isSecure() || $this->loopbackHttp())
            && $request->getSchemeAndHttpHost() === rtrim(config('app.url'), '/');
    }

    private function loopbackHttp(): bool
    {
        $origin = parse_url(config('app.url'));

        return app()->environment('local') && ($origin['scheme'] ?? null) === 'http'
            && in_array($origin['host'] ?? null, ['localhost', '127.0.0.1', '[::1]'], true);
    }

    private function validPassword(#[\SensitiveParameter] string $password, ?User $user): bool
    {
        $hash = $user?->password_hash;
        $algorithm = password_get_info($hash ?? '')['algoName'];
        if ($algorithm === 'unknown' || ($algorithm === 'bcrypt' && (strlen($password) > 72 || str_contains($password, "\0")))) {
            $rounds = config('hashing.bcrypt.rounds', 12);
            $dummy = sprintf('$2y$%02d$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', $rounds);
            password_verify('unavailable', $dummy);

            return false;
        }

        return password_verify($password, $hash);
    }

    private function attempt(string $key, int $limit, bool $countAttempt = true): ?int
    {
        $key = 'browser-auth:'.$key;
        $cache = Cache::store('database');

        $attempt = function () use ($cache, $key, $limit, $countAttempt) {
            $now = now()->timestamp;
            $attempts = array_values(array_filter($cache->get($key, []), fn (int $timestamp) => $timestamp > $now - 60));
            if (count($attempts) >= $limit) {
                return $attempts[0] + 60 - $now;
            }

            if ($countAttempt) {
                $attempts[] = $now;
                $cache->put($key, $attempts, 60);
            }

            return null;
        };

        return $countAttempt ? $cache->lock($key, 15)->block(2, $attempt) : $attempt();
    }

    private function sessionEstablished(array $result, string $token, string $csrf, bool $replay): Response
    {
        return $this->cookies(response()->json(['data' => $result], headers: [
            'X-Action-Replayed' => $replay ? 'true' : 'false',
        ]), $token, $csrf);
    }

    private function cookies(Response $response, ?string $token, ?string $csrf): Response
    {
        $secure = ! $this->loopbackHttp();
        $expires = $token === null ? 1 : 0;
        $response->headers->setCookie(new Cookie('ysp_session', $token, $expires, '/', null, $secure, true, false, 'lax'));
        $response->headers->setCookie(new Cookie('XSRF-TOKEN', $csrf, $expires, '/', null, $secure, false, false, 'lax'));

        return $response;
    }

    private function throttled(int $retry): Response
    {
        return $this->failure(429, 'throttled', 'Try again after the indicated delay.')->header('Retry-After', (string) $retry);
    }

    private function malformed(): Response
    {
        return $this->failure(400, 'malformed_request', 'Invalid request syntax.');
    }

    private function invalidCredentials(): Response
    {
        return $this->failure(401, 'invalid_credentials', 'Sign-in failed.');
    }

    private function failure(int $status, string $code, string $message, array $fields = []): Response
    {
        $error = ['code' => $code, 'message' => $message];
        if ($fields) {
            $error['fields'] = $fields;
        }

        return response()->json(['error' => $error, 'request_id' => (string) Str::uuid()], $status);
    }
}
