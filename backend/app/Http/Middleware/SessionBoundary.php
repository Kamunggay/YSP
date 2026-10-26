<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Modules\AccessChapterAdministration\SessionContract;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

final class SessionBoundary
{
    public function __construct(private SessionContract $contract) {}

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
            $response = $this->contract->failure('SessionForbidden', 403, 'origin_forbidden');
        } else {
            try {
                $response = $next($request);
            } catch (Throwable $exception) {
                report($exception);
                $response = $this->contract->failure('SessionUnavailable', 503);
            }
        }
        // Laravel's routing pipeline can render an inner exception before it
        // reaches this middleware's catch. Normalize that rendered failure too.
        if ($response->isServerError()) {
            $response = $this->contract->failure('SessionUnavailable', 503);
        }
        $response->headers->set('Cache-Control', 'no-store, private');

        return $response;
    }
}
