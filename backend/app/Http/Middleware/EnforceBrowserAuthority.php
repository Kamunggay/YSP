<?php

namespace App\Http\Middleware;

use App\Exceptions\ContractException;
use App\Http\BrowserSessionHttp;
use Closure;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PDOException;
use Symfony\Component\HttpFoundation\Response;

class EnforceBrowserAuthority
{
    public function handle(Request $request, Closure $next, ?string $budget = null): Response
    {
        $ipDelay = null;
        $namespace = $budget === 'evidence' ? 'paper-evidence' : 'chapter-authority';
        try {
            $ipDelay = $budget ? BrowserSessionHttp::attempt(
                'ip:'.hash('sha256', (string) $request->ip()), 60, namespace: $namespace
            ) : null;

            $response = DB::transaction(function () use ($request, $next, $budget, $ipDelay, $namespace) {
                $unsafe = ! $request->isMethodSafe();

                if ($unsafe && (count($request->headers->all('Origin')) !== 1 || ! BrowserSessionHttp::originAllowed($request, true))) {
                    throw new ContractException(403, 'origin_denied', 'Browser origin denied.');
                }

                $session = BrowserSessionHttp::requestMatchesOrigin($request) ? BrowserSessionHttp::session($request, true) : null;
                if ($unsafe && (! $session || count($request->headers->all('X-XSRF-TOKEN')) !== 1
                    || ! hash_equals($session->csrf_token, $request->header('X-XSRF-TOKEN', '')))) {
                    throw new ContractException(419, 'csrf_mismatch', 'Refresh browser CSRF protection.');
                }

                $user = $session?->expires_at?->isFuture() ? $session->currentUser() : null;
                $accountDelay = $budget && $user ? BrowserSessionHttp::attempt(
                    'account:'.$user->id, 60, namespace: $namespace
                ) : null;

                if ($retry = max($ipDelay, $accountDelay)) {
                    return self::error(new ContractException(429, 'throttled', 'Try again after the indicated delay.'))
                        ->header('Retry-After', (string) $retry);
                }

                if (! $user) {
                    throw new ContractException(401, 'unauthenticated', 'Sign in again.');
                }

                $session->refreshProgress($user);
                if ($session->next_step !== null) {
                    return self::error(new ContractException(403, 'mfa_incomplete', 'Complete authentication.'));
                }

                $request->setUserResolver(fn () => $user);

                $response = $next($request);
                if ($unsafe && $response->getStatusCode() >= 400) {
                    throw new HttpResponseException($response);
                }

                return $response;
            });
        } catch (HttpResponseException $exception) {
            $response = $exception->getResponse();
        } catch (ContractException $denied) {
            $response = $ipDelay !== null
                ? self::error(new ContractException(429, 'throttled', 'Try again after the indicated delay.'))->header('Retry-After', (string) $ipDelay)
                : self::error($denied);
        } catch (PDOException|LockTimeoutException) {
            $response = self::error(new ContractException(503, $budget === 'evidence' ? 'service_unavailable' : 'unavailable', 'Authority is temporarily unavailable.'));
        }

        return BrowserSessionHttp::noStore($response);
    }

    public static function error(ContractException $denied): Response
    {
        return response()->json($denied->toArray((string) Str::uuid()), $denied->statusCode);
    }
}
