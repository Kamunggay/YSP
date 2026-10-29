<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Modules\AccessChapterAdministration\SessionContract;
use App\Modules\AccessChapterAdministration\SignInThrottle;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class ChapterAccessThrottle
{
    public function __construct(private SignInThrottle $throttle, private SessionContract $contract) {}

    public function handle(Request $request, Closure $next, string $scope): Response
    {
        return $this->throttle->throttleIp($request, $this->contract, $scope) ?? $next($request);
    }
}
