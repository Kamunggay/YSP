<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Modules\AccessChapterAdministration\AuthenticatorEnrollments;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class DutyGrantThrottle
{
    public function __construct(private AuthenticatorEnrollments $enrollments) {}

    public function handle(Request $request, Closure $next): Response
    {
        return $this->enrollments->throttleIp($request, 'duty-grants') ?? $next($request);
    }
}
