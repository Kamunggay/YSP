<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationSubscriptionController extends Controller
{
    public function authorizeSession(Request $request): JsonResponse
    {
        $socketId = $request->input('socket_id');
        $channelName = $request->input('channel_name');

        if (! $socketId || ! $channelName) {
            return response()->json([
                'error' => [
                    'code' => 'invalid_input',
                    'message' => 'socket_id and channel_name are required.',
                ],
            ], 422);
        }

        $appKey = config('broadcasting.connections.reverb.key', 'stage1_app_key');
        $secret = config('broadcasting.connections.reverb.secret', 'secret');
        $signature = hash_hmac('sha256', "{$socketId}:{$channelName}", $secret);

        return response()->json([
            'auth' => "{$appKey}:{$signature}",
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function authorizeChapter(Request $request, string $chapter_id): JsonResponse
    {
        $socketId = $request->input('socket_id');
        $channelName = $request->input('channel_name');

        if (! $socketId || ! $channelName) {
            return response()->json([
                'error' => [
                    'code' => 'invalid_input',
                    'message' => 'socket_id and channel_name are required.',
                ],
            ], 422);
        }

        $appKey = config('broadcasting.connections.reverb.key', 'stage1_app_key');
        $secret = config('broadcasting.connections.reverb.secret', 'secret');
        $signature = hash_hmac('sha256', "{$socketId}:{$channelName}", $secret);

        return response()->json([
            'auth' => "{$appKey}:{$signature}",
        ], 200, ['Cache-Control' => 'no-store']);
    }
}
