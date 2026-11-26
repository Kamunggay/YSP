<?php

namespace App\Http\Middleware;

use App\Exceptions\ContractException;
use App\Http\BrowserSessionHttp;
use App\Http\PaperEvidenceDownload;
use App\Models\BrowserSession;
use App\Models\User;
use App\Services\Notifications\NotificationSubjectRead;
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
        if ($request->isMethod('GET') && ($user = $request->attributes->get(NotificationSubjectRead::class)) instanceof User) {
            $request->setUserResolver(fn () => $user);

            return $next($request);
        }

        $namespace = match ($budget) {
            'evidence' => 'paper-evidence',
            'notifications' => 'notification-authorization',
            default => 'chapter-authority',
        };
        try {
            $ipDelay = $budget ? BrowserSessionHttp::attempt(
                'ip:'.hash('sha256', (string) $request->ip()), 60, namespace: $namespace
            ) : null;
            if ($budget === 'notifications') {
                // Release the HTTP session lock before the broker takes a fresh lock for socket admission.
                $admission = $this->authorize($request, fn () => new Response('', 204), $budget, $ipDelay, $namespace);

                return $admission->getStatusCode() === 204 ? BrowserSessionHttp::noStore($next($request)) : $admission;
            }
            if ($budget !== 'evidence' || $request->route()?->getActionMethod() !== 'retrieveAttachment') {
                return $this->authorize($request, $next, $budget, $ipDelay, $namespace);
            }

            return $this->fencedDownload($request, $next, $ipDelay, $namespace);
        } catch (ContractException $denied) {
            return BrowserSessionHttp::noStore(self::error($denied));
        } catch (PDOException|LockTimeoutException) {
            return BrowserSessionHttp::noStore($this->unavailable($budget));
        }
    }

    private function fencedDownload(Request $request, Closure $next, ?int $ipDelay, string $namespace): Response
    {
        // The protected response is sent after middleware returns. Hold the locks through that send.
        $connection = DB::connection();
        $level = $connection->transactionLevel();
        $hold = false;
        try {
            $connection->beginTransaction();
            $response = $this->authorize($request, $next, 'evidence', $ipDelay, $namespace);
            if ($response instanceof PaperEvidenceDownload) {
                $response->holdAuthority($connection, $level, fn () => $this->authorize(
                    $request,
                    fn (Request $request) => app(EnforceStageOneChapter::class)->handle(
                        $request,
                        fn (Request $request) => app(EnforceStageOneAction::class)->handle(
                            $request, fn () => $response, ...PaperEvidenceDownload::ACTIONS,
                        ),
                    ),
                    'evidence', null, $namespace, countAccountAttempt: false,
                ));
                $hold = true;
            } else {
                $connection->commit();
            }

            return $response;
        } finally {
            if (! $hold && $connection->transactionLevel() > $level) {
                $connection->rollBack($level);
            }
        }
    }

    public function terminate(Request $request, Response $response): void
    {
        if ($response instanceof PaperEvidenceDownload) {
            $response->releaseAuthority();
        }
    }

    private function authorize(
        Request $request,
        Closure $next,
        ?string $budget,
        ?int $ipDelay,
        string $namespace,
        bool $countAccountAttempt = true,
    ): Response {
        try {
            $response = DB::transaction(function () use ($request, $next, $budget, $ipDelay, $namespace, $countAccountAttempt) {
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
                $accountDelay = $countAccountAttempt && $budget && $user ? BrowserSessionHttp::attempt(
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
                if ($budget === 'notifications') {
                    $request->attributes->set(BrowserSession::class, $session);
                }

                $response = $next($request);
                if ($unsafe && $response->getStatusCode() >= 400) {
                    throw new HttpResponseException($response);
                }

                return $response;
            });
        } catch (HttpResponseException $exception) {
            $response = $exception->getResponse();
        } catch (ContractException $denied) {
            $response = $ipDelay !== null && $budget !== 'notifications'
                ? self::error(new ContractException(429, 'throttled', 'Try again after the indicated delay.'))->header('Retry-After', (string) $ipDelay)
                : self::error($denied);
        } catch (PDOException|LockTimeoutException) {
            $response = $this->unavailable($budget);
        }

        return BrowserSessionHttp::noStore($response);
    }

    private function unavailable(?string $budget): Response
    {
        return self::error(new ContractException(503, $budget === 'evidence' ? 'service_unavailable' : 'unavailable', 'Authority is temporarily unavailable.'));
    }

    public static function error(ContractException $denied): Response
    {
        return response()->json($denied->toArray((string) Str::uuid()), $denied->statusCode);
    }
}
