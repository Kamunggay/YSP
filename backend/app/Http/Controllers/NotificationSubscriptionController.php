<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Requests\AuthInput;
use App\Models\BrowserSession;
use App\Services\Notifications\NotificationTransport;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use JsonException;
use RuntimeException;

class NotificationSubscriptionController extends Controller
{
    public function authorizeSession(Request $request, NotificationTransport $transport): JsonResponse
    {
        return $this->authorize($request, $transport);
    }

    public function authorizeChapter(Request $request, string $chapter_id, NotificationTransport $transport): JsonResponse
    {
        return $this->authorize($request, $transport, $chapter_id);
    }

    private function authorize(Request $request, NotificationTransport $transport, ?string $chapter = null): JsonResponse
    {
        if ($chapter !== null && ! preg_match(AuthInput::UUID, $chapter)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid chapter selector.');
        }
        if ($request->server('QUERY_STRING', '') !== '') {
            throw new ContractException(400, 'malformed_request', 'Unexpected query selectors.');
        }
        $media = strtolower(trim(explode(';', $request->header('Content-Type', ''))[0]));
        if ($media !== 'application/json') {
            throw new ContractException(415, 'unsupported_media_type', 'Send application/json.');
        }
        try {
            $body = AuthInput::decode($request);
        } catch (JsonException) {
            throw new ContractException(400, 'malformed_request', 'Malformed JSON request.');
        }

        $pattern = $chapter === null
            ? '/\Aprivate-stage1\.user\.[0-9a-f-]{36}\z/'
            : '/\Aprivate-stage1\.chapter\.[0-9a-f-]{36}\.user\.[0-9a-f-]{36}\z/';
        $fields = [];
        $values = $body instanceof \stdClass ? (array) $body : [];
        foreach (['socket_id' => '/\A[0-9]{1,20}\.[0-9]{1,20}\z/', 'channel_name' => $pattern] as $field => $format) {
            $code = match (true) {
                ! array_key_exists($field, $values) => 'required',
                ! is_string($values[$field]) => 'invalid_type',
                strlen($values[$field]) > ($field === 'socket_id' ? 41 : 128) => 'too_long',
                ! preg_match($format, $values[$field]) => 'invalid_format',
                default => null,
            };
            if ($code !== null) {
                $fields[] = ['pointer' => '/'.$field, 'code' => $code, 'message' => 'Supply a valid '.$field.'.'];
            }
        }
        foreach (array_diff_key($values, array_flip(['socket_id', 'channel_name'])) as $field => $unused) {
            $fields[] = [
                'pointer' => '/'.str_replace(['~', '/'], ['~0', '~1'], (string) $field),
                'code' => 'unexpected_field',
                'message' => 'This field is not accepted.',
            ];
        }
        if ($fields !== []) {
            throw new ContractException(422, 'invalid_input', 'Correct the indicated fields.', ['error' => [
                'code' => 'invalid_input', 'message' => 'Correct the indicated fields.', 'fields' => $fields,
            ]]);
        }

        $user = $request->user()->id;
        if ($values['channel_name'] !== ($chapter === null ? "private-stage1.user.{$user}" : "private-stage1.chapter.{$chapter}.user.{$user}")) {
            throw $this->denied();
        }

        $session = $request->attributes->get(BrowserSession::class);
        try {
            $result = $transport->call('authorize', [
                'socket_id' => $values['socket_id'], 'channel_name' => $values['channel_name'],
                'chapter_id' => $chapter, 'session_id' => $session->id, 'token_hash' => $session->token_hash,
            ]);
        } catch (ConnectionException|RuntimeException) {
            throw $this->unavailable();
        }
        if ($result->forbidden()) {
            throw $this->denied();
        }
        $auth = $result->json('auth');
        if (! $result->ok() || ! is_string($auth) || ! preg_match('/\A[A-Za-z0-9_-]{1,100}:[0-9a-f]{64}\z/', $auth)) {
            throw $this->unavailable();
        }

        return response()->json(['auth' => $auth]);
    }

    private function denied(): ContractException
    {
        return new ContractException(403, 'notification_subscription_denied', 'Private subscription unavailable.');
    }

    private function unavailable(): ContractException
    {
        return new ContractException(503, 'unavailable', 'Notification authorization temporarily unavailable.');
    }
}
