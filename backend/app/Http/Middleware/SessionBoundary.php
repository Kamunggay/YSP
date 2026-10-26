<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

final class SessionBoundary
{
    public function handle(Request $request, Closure $next): Response
    {
        $origin = (string) config('app.url');
        $fetchSite = $request->header('Sec-Fetch-Site');
        $suppliedOrigin = $request->header('Origin');
        $referer = parse_url((string) $request->header('Referer'));
        $refererOrigin = isset($referer['scheme'], $referer['host'])
            ? $referer['scheme'].'://'.$referer['host'].(isset($referer['port']) ? ':'.$referer['port'] : '') : null;
        if (($fetchSite !== null && $fetchSite !== 'same-origin')
            || ($suppliedOrigin !== null && $suppliedOrigin !== $origin)
            || ($fetchSite === null && $suppliedOrigin !== $origin && $refererOrigin !== $origin)) {
            $response = response()->json(['code' => 'origin_forbidden', 'message' => 'This request is not permitted.'], 403);
        } else {
            try {
                $response = $next($request);
            } catch (Throwable $exception) {
                report($exception);
                $response = response()->json(['code' => 'unavailable', 'message' => 'The session service is unavailable.'], 503);
            }
        }
        $response->headers->set('Cache-Control', 'no-store, private');

        return $response;
    }
}
