<?php

namespace App\Http\Middleware;

use App\Models\Chapter;
use App\Models\DutyGrant;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceDutyAuthority
{
    public function handle(Request $request, Closure $next, string ...$requiredDuties): Response
    {
        $chapterId = $request->route('chapter_id') ?? $request->header('X-Chapter-Id');
        $userId = $request->header('X-User-Id') ?? session('user_id');

        if (! $userId) {
            return response()->json([
                'error' => 'AUTHENTICATION_REQUIRED',
                'message' => 'Caller identity is required for authority enforcement.',
            ], 401);
        }

        // Resolve chapter if needed
        $chapter = $request->attributes->get('chapter');
        if (! $chapter && $chapterId) {
            $chapter = Chapter::where('id', $chapterId)->orWhere('code', $chapterId)->first();
        }
        $targetChapterId = $chapter ? $chapter->id : $chapterId;

        if (empty($requiredDuties)) {
            return $next($request);
        }

        $now = now();
        $query = DutyGrant::where('user_id', $userId)
            ->where('status', 'active')
            ->whereIn('duty_code', $requiredDuties);

        if ($targetChapterId) {
            $query->where('chapter_id', $targetChapterId);
        }

        $grants = $query->get();

        $hasValidGrant = false;
        foreach ($grants as $grant) {
            if ($grant->valid_from && $grant->valid_from->isAfter($now)) {
                continue;
            }
            if ($grant->valid_until && $grant->valid_until->isBefore($now)) {
                continue;
            }
            $hasValidGrant = true;
            break;
        }

        if (! $hasValidGrant) {
            return response()->json([
                'error' => 'FORBIDDEN_DUTY',
                'message' => 'User does not hold required duty authority: '.implode(', ', $requiredDuties),
            ], 403);
        }

        return $next($request);
    }
}
