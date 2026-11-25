<?php

namespace App\Http\Controllers;

use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function memberships(Request $request): JsonResponse
    {
        $userId = $request->header('X-User-Id') ?? session('user_id');
        if (! $userId) {
            return response()->json(['error' => ['code' => 'unauthenticated', 'message' => 'Sign in first.']], 401);
        }

        $memberships = ChapterMembership::where('user_id', $userId)
            ->where('membership_status', 'active')
            ->with('chapter')
            ->get();

        $data = [];
        foreach ($memberships as $m) {
            $chapter = $m->chapter ?? Chapter::find($m->chapter_id);
            $duties = DutyGrant::where('chapter_id', $m->chapter_id)
                ->where('user_id', $userId)
                ->where('status', 'active')
                ->get();

            $dutyCodes = $duties->pluck('duty_code')->unique()->values()->all();
            $dutyGrantsList = $duties->map(fn ($d) => [
                'id' => $d->id,
                'duty' => $d->duty_code,
                'scope' => $d->scope ?? ['unit_id' => null, 'limit_php' => null],
                'effective_from' => $d->valid_from ? $d->valid_from->toIso8601ZuluString() : $d->created_at->toIso8601ZuluString(),
                'effective_until' => $d->valid_until ? $d->valid_until->toIso8601ZuluString() : null,
            ])->all();

            $data[] = [
                'id' => $m->id,
                'chapter' => [
                    'id' => $chapter->id,
                    'reference' => $chapter->code,
                    'display_name' => $chapter->name,
                    'created_at' => $chapter->created_at->toIso8601ZuluString(),
                ],
                'duties' => $dutyCodes,
                'authority_version' => $m->version ?? 1,
                'duty_grants' => $dutyGrantsList,
            ];
        }

        return response()->json([
            'data' => $data,
            'page' => [
                'next_cursor' => null,
            ],
        ]);
    }
}
