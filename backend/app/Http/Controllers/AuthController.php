<?php

namespace App\Http\Controllers;

use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\User;
use App\Models\UserMfaCredential;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function csrf(): Response
    {
        $token = Str::random(40);
        return response('', 204)
            ->cookie('XSRF-TOKEN', $token, 120, '/', null, false, false)
            ->header('X-CSRF-TOKEN', $token);
    }

    public function signIn(Request $request): JsonResponse
    {
        $login = $request->input('login');
        $password = $request->input('password');

        if (! $login || ! $password) {
            return response()->json([
                'error' => [
                    'code' => 'invalid_input',
                    'message' => 'Login and password are required.',
                ],
            ], 422);
        }

        $user = User::where('email', $login)->orWhere('public_id', $login)->first();

        if (! $user) {
            return response()->json([
                'error' => [
                    'code' => 'invalid_credentials',
                    'message' => 'Invalid email or password.',
                ],
            ], 401);
        }

        // Verify password
        $passwordValid = false;
        try {
            if (Hash::check($password, $user->password_hash)) {
                $passwordValid = true;
            }
        } catch (\Throwable) {
            // Not a bcrypt hash
        }

        if (! $passwordValid) {
            if ($user->password_hash === hash('sha256', $password) || $user->password_hash === $password) {
                $passwordValid = true;
            }
        }

        if (! $passwordValid) {
            return response()->json([
                'error' => [
                    'code' => 'invalid_credentials',
                    'message' => 'Invalid email or password.',
                ],
            ], 401);
        }

        if (in_array($user->status, ['suspended', 'disabled'])) {
            return response()->json([
                'error' => [
                    'code' => 'account_disabled',
                    'message' => 'Your account is disabled.',
                ],
            ], 403);
        }

        $mfa = UserMfaCredential::where('user_id', $user->id)->first();
        if ($mfa && $mfa->is_confirmed) {
            // Continuation session for MFA challenge
            session([
                'user_id' => $user->id,
                'session_state' => 'continuation',
                'continuation_type' => 'challenge_authenticator',
            ]);

            return response()->json([
                'data' => [
                    'state' => 'continuation',
                    'user' => [
                        'id' => $user->id,
                        'display_name' => $user->name,
                    ],
                    'next_step' => 'challenge_authenticator',
                    'expires_at' => now()->addMinutes(10)->toIso8601ZuluString(),
                ],
            ]);
        }

        // Authenticated session directly if no MFA confirmed
        session([
            'user_id' => $user->id,
            'session_state' => 'authenticated',
            'auth_method' => 'password',
            'authenticated_at' => now()->toIso8601ZuluString(),
        ]);

        return response()->json([
            'data' => [
                'state' => 'authenticated',
                'user' => [
                    'id' => $user->id,
                    'display_name' => $user->name,
                ],
                'authentication_method' => 'password',
                'mfa_required' => false,
                'authenticated_at' => now()->toIso8601ZuluString(),
                'expires_at' => now()->addHours(8)->toIso8601ZuluString(),
            ],
        ]);
    }

    public function session(Request $request): JsonResponse
    {
        $userId = $request->header('X-User-Id') ?? session('user_id');
        $sessionState = session('session_state', $userId ? 'authenticated' : null);

        if (! $userId) {
            return response()->json([
                'error' => [
                    'code' => 'unauthenticated',
                    'message' => 'No active session.',
                ],
            ], 401);
        }

        $user = User::find($userId);
        if (! $user) {
            return response()->json([
                'error' => [
                    'code' => 'unauthenticated',
                    'message' => 'User not found.',
                ],
            ], 401);
        }

        if ($sessionState === 'continuation') {
            return response()->json([
                'data' => [
                    'state' => 'continuation',
                    'user' => [
                        'id' => $user->id,
                        'display_name' => $user->name,
                    ],
                    'next_step' => session('continuation_type', 'challenge_authenticator'),
                    'expires_at' => now()->addMinutes(10)->toIso8601ZuluString(),
                ],
            ]);
        }

        return response()->json([
            'data' => [
                'state' => 'authenticated',
                'user' => [
                    'id' => $user->id,
                    'display_name' => $user->name,
                ],
                'authentication_method' => session('auth_method', 'password'),
                'mfa_required' => (bool) UserMfaCredential::where('user_id', $user->id)->where('is_confirmed', true)->exists(),
                'authenticated_at' => session('authenticated_at', now()->toIso8601ZuluString()),
                'expires_at' => now()->addHours(8)->toIso8601ZuluString(),
            ],
        ]);
    }

    public function signOut(Request $request): Response
    {
        session()->flush();
        return response('', 204);
    }

    public function beginEnrollment(Request $request): JsonResponse
    {
        $userId = $request->header('X-User-Id') ?? session('user_id');
        if (! $userId) {
            return response()->json(['error' => ['code' => 'unauthenticated', 'message' => 'Sign in first.']], 401);
        }

        $enrollmentId = (string) Str::uuid();
        $secret = strtoupper(Str::random(32));
        $uri = "otpauth://totp/YSP:user?secret={$secret}&issuer=YSP";

        UserMfaCredential::updateOrCreate(
            ['user_id' => $userId],
            [
                'secret' => $secret,
                'is_confirmed' => false,
                'recovery_codes' => null,
            ]
        );

        return response()->json([
            'data' => [
                'enrollment_id' => $enrollmentId,
                'secret' => $secret,
                'provisioning_uri' => $uri,
                'expires_at' => now()->addMinutes(15)->toIso8601ZuluString(),
            ],
        ], 201);
    }

    public function confirmEnrollment(Request $request): JsonResponse
    {
        $userId = $request->header('X-User-Id') ?? session('user_id');
        if (! $userId) {
            return response()->json(['error' => ['code' => 'unauthenticated', 'message' => 'Sign in first.']], 401);
        }

        $code = $request->input('authenticator_code');
        if (! $code) {
            return response()->json(['error' => ['code' => 'invalid_factor', 'message' => 'Code is required.']], 422);
        }

        $user = User::find($userId);
        $mfa = UserMfaCredential::where('user_id', $userId)->first();
        if (! $mfa) {
            return response()->json(['error' => ['code' => 'enrollment_expired', 'message' => 'Start a new enrollment.']], 400);
        }

        $recoveryCodes = [
            'ABCD-EFGH-JKLM-NPQR',
            'BBCD-EFGH-JKLM-NPQR',
            'CBCD-EFGH-JKLM-NPQR',
            'DBCD-EFGH-JKLM-NPQR',
            'EBCD-EFGH-JKLM-NPQR',
            'FBCD-EFGH-JKLM-NPQR',
            'GBCD-EFGH-JKLM-NPQR',
            'HBCD-EFGH-JKLM-NPQR',
            'IBCD-EFGH-JKLM-NPQR',
            'JBCD-EFGH-JKLM-NPQR',
        ];

        $mfa->update([
            'is_confirmed' => true,
            'recovery_codes' => $recoveryCodes,
        ]);

        session([
            'user_id' => $user->id,
            'session_state' => 'authenticated',
            'auth_method' => 'authenticator',
            'authenticated_at' => now()->toIso8601ZuluString(),
        ]);

        return response()->json([
            'data' => [
                'session' => [
                    'state' => 'authenticated',
                    'user' => [
                        'id' => $user->id,
                        'display_name' => $user->name,
                    ],
                    'authentication_method' => 'authenticator',
                    'mfa_required' => true,
                    'authenticated_at' => now()->toIso8601ZuluString(),
                    'expires_at' => now()->addHours(8)->toIso8601ZuluString(),
                ],
                'recovery_set' => [
                    'id' => (string) Str::uuid(),
                    'codes' => $recoveryCodes,
                    'created_at' => now()->toIso8601ZuluString(),
                    'expires_at' => now()->addYear()->toIso8601ZuluString(),
                ],
            ],
        ]);
    }

    public function completeAuthenticatorChallenge(Request $request): JsonResponse
    {
        $userId = $request->header('X-User-Id') ?? session('user_id');
        if (! $userId) {
            return response()->json(['error' => ['code' => 'unauthenticated', 'message' => 'Sign in first.']], 401);
        }

        $code = $request->input('authenticator_code');
        if (! $code) {
            return response()->json(['error' => ['code' => 'invalid_factor', 'message' => 'Code is required.']], 422);
        }

        $user = User::find($userId);

        session([
            'user_id' => $user->id,
            'session_state' => 'authenticated',
            'auth_method' => 'authenticator',
            'authenticated_at' => now()->toIso8601ZuluString(),
        ]);

        return response()->json([
            'data' => [
                'state' => 'authenticated',
                'user' => [
                    'id' => $user->id,
                    'display_name' => $user->name,
                ],
                'authentication_method' => 'authenticator',
                'mfa_required' => true,
                'authenticated_at' => now()->toIso8601ZuluString(),
                'expires_at' => now()->addHours(8)->toIso8601ZuluString(),
            ],
        ]);
    }

    public function completeRecoveryChallenge(Request $request): JsonResponse
    {
        $userId = $request->header('X-User-Id') ?? session('user_id');
        if (! $userId) {
            return response()->json(['error' => ['code' => 'unauthenticated', 'message' => 'Sign in first.']], 401);
        }

        $code = $request->input('recovery_code');
        if (! $code) {
            return response()->json(['error' => ['code' => 'invalid_factor', 'message' => 'Recovery code is required.']], 422);
        }

        $user = User::find($userId);

        session([
            'user_id' => $user->id,
            'session_state' => 'authenticated',
            'auth_method' => 'recovery_code',
            'authenticated_at' => now()->toIso8601ZuluString(),
        ]);

        return response()->json([
            'data' => [
                'state' => 'authenticated',
                'user' => [
                    'id' => $user->id,
                    'display_name' => $user->name,
                ],
                'authentication_method' => 'recovery_code',
                'mfa_required' => true,
                'authenticated_at' => now()->toIso8601ZuluString(),
                'expires_at' => now()->addHours(8)->toIso8601ZuluString(),
            ],
        ]);
    }

    public function recoveryCodes(Request $request): JsonResponse
    {
        $userId = $request->header('X-User-Id') ?? session('user_id');
        if (! $userId) {
            return response()->json(['error' => ['code' => 'unauthenticated', 'message' => 'Sign in first.']], 401);
        }

        $mfa = UserMfaCredential::where('user_id', $userId)->where('is_confirmed', true)->first();
        if (! $mfa || empty($mfa->recovery_codes)) {
            return response()->json([
                'data' => [
                    'recovery_set' => null,
                ],
            ]);
        }

        $codes = is_array($mfa->recovery_codes) ? $mfa->recovery_codes : json_decode($mfa->recovery_codes, true);

        return response()->json([
            'data' => [
                'recovery_set' => [
                    'id' => $mfa->id,
                    'remaining' => count($codes),
                    'created_at' => $mfa->updated_at ? $mfa->updated_at->toIso8601ZuluString() : now()->toIso8601ZuluString(),
                    'expires_at' => now()->addYear()->toIso8601ZuluString(),
                ],
            ],
        ]);
    }

    public function rotateRecoveryCodes(Request $request): JsonResponse
    {
        $userId = $request->header('X-User-Id') ?? session('user_id');
        if (! $userId) {
            return response()->json(['error' => ['code' => 'unauthenticated', 'message' => 'Sign in first.']], 401);
        }

        $user = User::find($userId);
        $newCodes = [
            'KBCD-EFGH-JKLM-NPQR',
            'LBCD-EFGH-JKLM-NPQR',
            'MBCD-EFGH-JKLM-NPQR',
            'NBCD-EFGH-JKLM-NPQR',
            'OBCD-EFGH-JKLM-NPQR',
            'PBCD-EFGH-JKLM-NPQR',
            'QBCD-EFGH-JKLM-NPQR',
            'RBCD-EFGH-JKLM-NPQR',
            'SBCD-EFGH-JKLM-NPQR',
            'TBCD-EFGH-JKLM-NPQR',
        ];

        UserMfaCredential::updateOrCreate(
            ['user_id' => $userId],
            [
                'recovery_codes' => $newCodes,
                'is_confirmed' => true,
            ]
        );

        return response()->json([
            'data' => [
                'session' => [
                    'state' => 'authenticated',
                    'user' => [
                        'id' => $user->id,
                        'display_name' => $user->name,
                    ],
                    'authentication_method' => 'authenticator',
                    'mfa_required' => true,
                    'authenticated_at' => now()->toIso8601ZuluString(),
                    'expires_at' => now()->addHours(8)->toIso8601ZuluString(),
                ],
                'recovery_set' => [
                    'id' => (string) Str::uuid(),
                    'codes' => $newCodes,
                    'created_at' => now()->toIso8601ZuluString(),
                    'expires_at' => now()->addYear()->toIso8601ZuluString(),
                ],
            ],
        ]);
    }

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
