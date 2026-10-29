<?php

declare(strict_types=1);

namespace App\Modules\AccessChapterAdministration;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class GlobalIdentityDisable
{
    public function __construct(
        private BrowserSessions $sessions,
    ) {}

    public function disable(Request $request): JsonResponse
    {
        if ($this->hasInvalidSelectors($request) || $request->query->count() > 0) {
            return $this->invalidSelector();
        }

        $snapshot = $this->sessions->snapshot($request);
        if ($snapshot['state'] === 'signed_out') {
            return $this->unauthorized();
        }

        if ($snapshot['state'] !== 'authenticated') {
            return $this->forbidden();
        }

        $body = json_decode($request->getContent(), true);
        if (! $request->isJson() || ! is_array($body)) {
            return response()->json([
                'code' => 'validation_failed',
                'message' => 'Correct the indicated field.',
                'field_feedback' => [
                    [
                        'path' => '',
                        'code' => 'INVALID',
                        'message' => 'Provide a valid JSON object.',
                    ],
                ],
                'next_action' => 'correct_fields',
            ], 422, ['Cache-Control' => 'no-store']);
        }

        $feedback = [];
        $allowedKeys = ['idempotency_key', 'identity', 'expected_identity_version', 'reason'];
        foreach (array_keys($body) as $key) {
            if (! in_array($key, $allowedKeys, true)) {
                $feedback[] = [
                    'path' => '/'.$key,
                    'code' => 'INVALID',
                    'message' => 'Use only documented fields.',
                ];
            }
        }

        $key = $body['idempotency_key'] ?? null;
        if (! is_string($key) || ! preg_match('/^[A-Za-z0-9._~-]{1,100}$/D', $key)) {
            $feedback[] = [
                'path' => '/idempotency_key',
                'code' => 'INVALID',
                'message' => 'Use a valid value.',
            ];
        }

        $identity = $body['identity'] ?? null;
        if (! is_array($identity)) {
            $feedback[] = [
                'path' => '/identity',
                'code' => 'INVALID',
                'message' => 'Use a valid value.',
            ];
        } else {
            $userId = $identity['user_id'] ?? null;
            $extraIdentityKeys = array_diff(array_keys($identity), ['user_id']);
            if ($extraIdentityKeys !== [] || ! is_string($userId) || ! preg_match('/^[1-9][0-9]{0,19}$/D', $userId) || (strlen($userId) === 20 && strcmp($userId, '18446744073709551615') > 0)) {
                $feedback[] = [
                    'path' => '/identity/user_id',
                    'code' => 'INVALID',
                    'message' => 'Use a valid value.',
                ];
            }
        }

        $version = $body['expected_identity_version'] ?? null;
        if (! is_int($version) || $version < 1 || $version > 4294967295) {
            $feedback[] = [
                'path' => '/expected_identity_version',
                'code' => 'INVALID',
                'message' => 'Use a valid value.',
            ];
        }

        $reason = $body['reason'] ?? null;
        if (! is_string($reason) || strlen($reason) < 1 || strlen($reason) > 500) {
            $feedback[] = [
                'path' => '/reason',
                'code' => 'INVALID',
                'message' => 'Use a valid value.',
            ];
        }

        if ($feedback !== []) {
            return response()->json([
                'code' => 'validation_failed',
                'message' => 'Correct the indicated field.',
                'field_feedback' => $feedback,
                'next_action' => 'correct_fields',
            ], 422, ['Cache-Control' => 'no-store']);
        }

        return $this->unavailable();
    }

    public function lookupByKey(Request $request): JsonResponse
    {
        if ($this->hasInvalidSelectors($request)) {
            return $this->invalidSelector();
        }

        $snapshot = $this->sessions->snapshot($request);
        if ($snapshot['state'] === 'signed_out') {
            return $this->unauthorized();
        }

        if ($snapshot['state'] !== 'authenticated') {
            return $this->forbidden();
        }

        $query = $request->query->all();
        $actionCode = $query['action_code'] ?? null;
        $idempotencyKey = $query['idempotency_key'] ?? null;
        $extraKeys = array_diff(array_keys($query), ['action_code', 'idempotency_key']);

        if ($extraKeys !== []
            || ! is_string($actionCode) || $actionCode !== 'identity.disable'
            || ! is_string($idempotencyKey) || ! preg_match('/^[A-Za-z0-9._~-]{1,100}$/D', $idempotencyKey)) {
            return $this->invalidSelector();
        }

        return $this->unavailable();
    }

    public function lookupById(Request $request, string $operation_id): JsonResponse
    {
        if ($this->hasInvalidSelectors($request) || $request->query->count() > 0) {
            return $this->invalidSelector();
        }

        if (! preg_match('/^[0-9A-HJKMNP-TV-Z]{26}$/D', $operation_id)) {
            return $this->invalidSelector();
        }

        $snapshot = $this->sessions->snapshot($request);
        if ($snapshot['state'] === 'signed_out') {
            return $this->unauthorized();
        }

        if ($snapshot['state'] !== 'authenticated') {
            return $this->forbidden();
        }

        return $this->unavailable();
    }

    private function hasInvalidSelectors(Request $request): bool
    {
        return $request->headers->has('X-Chapter-Context');
    }

    private function invalidSelector(): JsonResponse
    {
        return response()->json([
            'code' => 'invalid_selector',
            'message' => 'Use only the documented single-valued selectors.',
        ], 400, ['Cache-Control' => 'no-store']);
    }

    private function unauthorized(): JsonResponse
    {
        return response()->json([
            'code' => 'authentication_required',
            'message' => 'Sign in to continue.',
        ], 401, ['Cache-Control' => 'no-store']);
    }

    private function forbidden(): JsonResponse
    {
        return response()->json([
            'code' => 'forbidden',
            'message' => 'This request is not permitted.',
        ], 403, ['Cache-Control' => 'no-store']);
    }

    private function unavailable(): JsonResponse
    {
        return response()->json([
            'code' => 'global_identity_disable_unavailable',
            'message' => 'Global identity disable is unavailable.',
            'next_action' => 'do_not_retry_mutation',
        ], 503, ['Cache-Control' => 'no-store']);
    }
}
