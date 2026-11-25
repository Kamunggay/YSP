<?php

namespace App\Http;

use App\Models\BrowserSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;

final class BrowserSessionHttp
{
    public static function noStore(Response $response): Response
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

    public static function originAllowed(Request $request, bool $unsafe): bool
    {
        $origin = rtrim(config('app.url'), '/');
        if (! self::requestMatchesOrigin($request)) {
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

    public static function requestMatchesOrigin(Request $request): bool
    {
        return ($request->isSecure() || self::loopbackHttp())
            && $request->getSchemeAndHttpHost() === rtrim(config('app.url'), '/');
    }

    public static function loopbackHttp(): bool
    {
        $origin = parse_url(config('app.url'));

        return app()->environment('local') && ($origin['scheme'] ?? null) === 'http'
            && in_array($origin['host'] ?? null, ['localhost', '127.0.0.1', '[::1]'], true);
    }

    public static function attempt(string $key, int $limit, bool $countAttempt = true, string $namespace = 'browser-auth'): ?int
    {
        $key = $namespace.':'.$key;
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

    public static function session(Request $request, bool $includeExpired = false): ?BrowserSession
    {
        $token = $request->cookie('ysp_session');

        return is_string($token) && preg_match('/\A[a-f0-9]{64}\z/', $token)
            ? BrowserSession::where('token_hash', hash('sha256', $token))
                ->when(! $includeExpired, fn ($query) => $query->where('expires_at', '>', now()))
                ->lockForUpdate()->first()
            : null;
    }
}
