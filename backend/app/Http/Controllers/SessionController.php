<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Modules\AccessChapterAdministration\AuthenticatorEnrollments;
use App\Modules\AccessChapterAdministration\BrowserSessions;
use App\Modules\AccessChapterAdministration\SessionContract;
use App\Modules\AccessChapterAdministration\SignInThrottle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class SessionController
{
    public function prepareEnrollment(Request $request, AuthenticatorEnrollments $enrollments): JsonResponse
    {
        return $enrollments->prepare($request);
    }

    public function confirmEnrollment(Request $request, AuthenticatorEnrollments $enrollments): JsonResponse
    {
        return $enrollments->confirm($request);
    }

    public function signOut(Request $request, BrowserSessions $sessions): Response
    {
        $sessions->cycleSession($request);

        return response()->noContent();
    }

    public function getSession(Request $request, BrowserSessions $sessions): JsonResponse
    {
        return response()->json($sessions->snapshot($request));
    }

    public function signIn(Request $request, BrowserSessions $sessions, SessionContract $contract, SignInThrottle $throttle): JsonResponse
    {
        return $throttle->run($request, $contract, fn (): JsonResponse => $this->attemptSignIn($request, $sessions, $contract));
    }

    private function attemptSignIn(Request $request, BrowserSessions $sessions, SessionContract $contract): JsonResponse
    {
        $body = json_decode($request->getContent());
        $schema = $contract->metadata()['$defs']['SignInRequest'];
        $errors = [];
        foreach ($schema['required'] as $field) {
            if (! is_object($body) || ! isset($body->$field) || ! is_string($body->$field)
                || $body->$field === '' || ($field === 'email' && ! filter_var($body->$field, FILTER_VALIDATE_EMAIL))) {
                $errors[] = $field;
            }
        }
        if (! $request->isJson() || ! is_object($body)
            || array_diff(array_keys(get_object_vars($body)), array_keys($schema['properties'])) !== []) {
            $errors[] = 'email';
        }
        if ($errors !== []) {
            return response()->json([
                'code' => 'invalid_input', 'message' => 'Check the submitted fields.',
                'field_errors' => array_map(fn (string $field): array => [
                    'pointer' => '/'.$field, 'code' => 'invalid', 'message' => 'Check this field.',
                ], array_values(array_unique($errors))),
            ], 422);
        }
        $snapshot = $sessions->signIn($request, $body->email, $body->password);

        return $snapshot === null
            ? $contract->failure('SessionUnauthorized', 401) : response()->json($snapshot);
    }
}
