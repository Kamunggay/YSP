<?php

namespace App\Http\Controllers;

use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationSubscriptionController extends Controller
{
    public function authorizeSession(Request $request): JsonResponse
    {
        $userId = $request->header('X-User-Id') ?? session('user_id');
        if (! $userId) {
            return response()->json([
                'error' => [
                    'code' => 'unauthenticated',
                    'message' => 'Authentication is required.',
                ],
            ], 401, ['Cache-Control' => 'no-store']);
        }

        $user = User::where('id', $userId)->first();
        if (! $user || $user->status !== 'active') {
            return response()->json([
                'error' => [
                    'code' => 'unauthenticated',
                    'message' => 'Active user session is required.',
                ],
            ], 401, ['Cache-Control' => 'no-store']);
        }

        $validationError = $this->validateInput($request);
        if ($validationError) {
            return $validationError;
        }

        $socketId = $request->input('socket_id');
        $channelName = $request->input('channel_name');
        $expectedChannel = "private-stage1.user.{$user->id}";

        if ($channelName !== $expectedChannel || str_contains($channelName, '*')) {
            return response()->json([
                'error' => [
                    'code' => 'notification_subscription_denied',
                    'message' => 'Private subscription unavailable.',
                ],
            ], 403, ['Cache-Control' => 'no-store']);
        }

        return $this->signedAuthResponse($socketId, $channelName);
    }

    public function authorizeChapter(Request $request, string $chapter_id): JsonResponse
    {
        $userId = $request->header('X-User-Id') ?? session('user_id');
        if (! $userId) {
            return response()->json([
                'error' => [
                    'code' => 'unauthenticated',
                    'message' => 'Authentication is required.',
                ],
            ], 401, ['Cache-Control' => 'no-store']);
        }

        $user = User::where('id', $userId)->first();
        if (! $user || $user->status !== 'active') {
            return response()->json([
                'error' => [
                    'code' => 'unauthenticated',
                    'message' => 'Active user session is required.',
                ],
            ], 401, ['Cache-Control' => 'no-store']);
        }

        $chapter = $request->attributes->get('chapter')
            ?? Chapter::where('id', $chapter_id)->orWhere('code', $chapter_id)->first();

        if (! $chapter) {
            return response()->json([
                'error' => [
                    'code' => 'chapter_not_found',
                    'message' => "Chapter {$chapter_id} was not found.",
                ],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $membership = ChapterMembership::where('chapter_id', $chapter->id)
            ->where('user_id', $user->id)
            ->where('membership_status', 'active')
            ->first();

        if (! $membership) {
            return response()->json([
                'error' => [
                    'code' => 'notification_subscription_denied',
                    'message' => 'Private subscription unavailable.',
                ],
            ], 403, ['Cache-Control' => 'no-store']);
        }

        $validationError = $this->validateInput($request);
        if ($validationError) {
            return $validationError;
        }

        $socketId = $request->input('socket_id');
        $channelName = $request->input('channel_name');
        $expectedChannel = "private-stage1.chapter.{$chapter->id}.user.{$user->id}";

        if ($channelName !== $expectedChannel || str_contains($channelName, '*')) {
            return response()->json([
                'error' => [
                    'code' => 'notification_subscription_denied',
                    'message' => 'Private subscription unavailable.',
                ],
            ], 403, ['Cache-Control' => 'no-store']);
        }

        return $this->signedAuthResponse($socketId, $channelName);
    }

    private function validateInput(Request $request): ?JsonResponse
    {
        $socketId = $request->input('socket_id');
        $channelName = $request->input('channel_name');

        if (! is_string($socketId) || trim($socketId) === '' || ! preg_match('/^\d+\.\d+$/', $socketId)) {
            return response()->json([
                'error' => [
                    'code' => 'invalid_input',
                    'message' => 'Correct the indicated fields.',
                    'fields' => [
                        [
                            'pointer' => '/socket_id',
                            'code' => 'invalid_type',
                            'message' => 'Socket identity must be a string in <digits>.<digits> format.',
                        ],
                    ],
                ],
            ], 422, ['Cache-Control' => 'no-store']);
        }

        if (! is_string($channelName) || trim($channelName) === '') {
            return response()->json([
                'error' => [
                    'code' => 'invalid_input',
                    'message' => 'Correct the indicated fields.',
                    'fields' => [
                        [
                            'pointer' => '/channel_name',
                            'code' => 'invalid_type',
                            'message' => 'channel_name must be a non-empty string.',
                        ],
                    ],
                ],
            ], 422, ['Cache-Control' => 'no-store']);
        }

        return null;
    }

    private function signedAuthResponse(string $socketId, string $channelName): JsonResponse
    {
        $appKey = config('broadcasting.connections.reverb.key') ?: 'stage1_app_key';
        $secret = config('broadcasting.connections.reverb.secret') ?: 'secret';
        $signature = hash_hmac('sha256', "{$socketId}:{$channelName}", $secret);

        return response()->json([
            'auth' => "{$appKey}:{$signature}",
        ], 200, ['Cache-Control' => 'no-store']);
    }
}
