<?php

namespace App\Http\Middleware;

use App\Models\Chapter;
use App\Models\ChapterMembership;
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
            // For synthetic IDs in tests/contracts, if chapter does not exist yet,
            // check if chapter is created or return 404
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

        // If user is identified via header or session, verify membership
        $userId = $request->header('X-User-Id') ?? session('user_id');
        if ($userId) {
            $membership = ChapterMembership::where('chapter_id', $chapter->id)
                ->where('user_id', $userId)
                ->where('membership_status', 'active')
                ->first();

            if (! $membership) {
                // If user is explicitly provided but has no active membership in this chapter
                return response()->json([
                    'error' => 'MEMBERSHIP_REQUIRED',
                    'message' => "User does not have an active membership in chapter {$chapter->id}.",
                ], 403);
            }

            $request->attributes->set('membership', $membership);
        }

        return $next($request);
    }
}
