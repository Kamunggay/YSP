<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;

final class SessionForgeryGuard extends PreventRequestForgery
{
    public function handle($request, Closure $next)
    {
        if (! $this->isReading($request)
            && ($request->exists('_token') || $request->headers->has('X-CSRF-TOKEN') || ! $this->tokensMatch($request))) {
            return response()->json([
                'code' => 'csrf_mismatch', 'message' => 'Refresh CSRF before a reviewed new attempt.',
            ], 419);
        }
        $response = $next($request);
        $response->headers->set('Cache-Control', 'no-store, private');

        return $this->addCookieToResponse($request, $response);
    }
}
