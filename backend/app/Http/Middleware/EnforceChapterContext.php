<?php

namespace App\Http\Middleware;

use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceChapterContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $chapterId = $request->route('chapter_id') ?? $request->header('X-Chapter-Id');

        if (! $chapterId) {
            return $next($request);
        }

        $chapter = Chapter::where('id', $chapterId)
            ->orWhere('code', $chapterId)
            ->first();

        if (! $chapter) {
            return response()->json([
                'error' => 'CHAPTER_NOT_FOUND',
                'message' => "Chapter {$chapterId} was not found.",
            ], 404);
        }

        if (in_array($chapter->status, ['suspended', 'retired'])) {
            return response()->json([
                'error' => 'CHAPTER_INACTIVE',
                'message' => "Chapter is currently {$chapter->status}.",
            ], 403);
        }

        $request->attributes->set('chapter', $chapter);

        $userId = $request->header('X-User-Id') ?? session('user_id');
        if (! $userId) {
            return response()->json([
                'error' => 'AUTHENTICATION_REQUIRED',
                'message' => 'Authentication is required for chapter-scoped operations.',
            ], 401);
        }

        $user = User::where('id', $userId)->first();
        if (! $user || $user->status !== 'active') {
            return response()->json([
                'error' => 'AUTHENTICATION_REQUIRED',
                'message' => 'Active authenticated user is required.',
            ], 401);
        }

        $membership = ChapterMembership::where('chapter_id', $chapter->id)
            ->where('user_id', $user->id)
            ->where('membership_status', 'active')
            ->first();

        if (! $membership) {
            return response()->json([
                'error' => 'MEMBERSHIP_REQUIRED',
                'message' => "User does not have an active membership in chapter {$chapter->id}.",
            ], 403);
        }

        $request->attributes->set('membership', $membership);

        return $next($request);
    }
}
