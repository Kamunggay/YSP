<?php

namespace Tests\Feature\Stage1A;

use App\Models\Chapter;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use OTPHP\TOTP;
use Tests\TestCase;

class BrowserSessionTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'https://ysp.example.invalid';

    private const PASSWORD = ' synthetic exact password ';

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.url' => self::ORIGIN, 'app.key' => 'base64:'.base64_encode(random_bytes(32)), 'hashing.bcrypt.rounds' => 4]);
        $this->travelTo(now()->startOfSecond());
    }

    public function test_https_csrf_initialization_and_password_session(): void
    {
        $officer = $this->officer();
        $this->requestAuth('GET', 'csrf')->assertForbidden()->assertJsonPath('error.code', 'origin_denied');
        $anonymous = $this->startBrowser();

        $this->assertCookiePair($anonymous);
        $this->requestAuth('GET', 'session', headers: ['HTTP_X_USER_ID' => $officer->id])
            ->assertUnauthorized()->assertJsonPath('error.code', 'unauthenticated');

        $signedIn = $this->signIn($anonymous, $officer)->assertOk()->assertHeader('X-Action-Replayed', 'false');
        $this->assertCookiePair($signedIn);
        $this->assertNotSame($this->cookies($anonymous)['ysp_session'], $this->cookies($signedIn)['ysp_session']);
        $this->assertNotSame($this->cookies($anonymous)['XSRF-TOKEN'], $this->cookies($signedIn)['XSRF-TOKEN']);

        $signedIn->assertExactJson(['data' => [
            'state' => 'authenticated',
            'user' => ['id' => $officer->id, 'display_name' => $officer->name],
            'authentication_method' => 'password',
            'mfa_required' => false,
            'authenticated_at' => now()->toISOString(),
            'expires_at' => now()->addHours(2)->toISOString(),
        ]]);
        $this->requestAuth('GET', 'session', $signedIn)->assertExactJson($signedIn->json());
        $this->requestAuth('GET', 'session', $anonymous)->assertUnauthorized();
    }

    public function test_origin_csrf_and_closed_request_validation(): void
    {
        $this->call('GET', 'http://ysp.example.invalid/api/v1/auth/csrf', server: [
            'HTTP_SEC_FETCH_SITE' => 'same-origin', 'HTTP_X_FORWARDED_PROTO' => 'https',
        ])->assertForbidden();
        $this->requestAuth('GET', 'csrf', headers: ['HTTP_SEC_FETCH_SITE' => 'cross-site'])
            ->assertForbidden()->assertHeaderMissing('Access-Control-Allow-Credentials')->assertHeaderMissing('Set-Cookie');
        $this->requestAuth('GET', 'csrf', headers: ['HTTP_REFERER' => self::ORIGIN.'/sign-in'])->assertNoContent();
        $this->requestAuth('GET', 'csrf?extra=1', headers: ['HTTP_ORIGIN' => self::ORIGIN])->assertBadRequest();

        $browser = $this->startBrowser();
        $this->assertError($this->requestAuth('POST', 'sign-in', $browser, headers: ['HTTP_ORIGIN' => 'null']), 403, 'origin_denied');
        $this->assertError($this->requestAuth('POST', 'sign-in', $browser, headers: ['HTTP_X_XSRF_TOKEN' => 'incorrect']), 419, 'csrf_mismatch');
        $this->assertError($this->requestAuth('POST', 'sign-in', $browser, key: 'not-a-uuid'), 400, 'malformed_request');
        $this->assertError($this->requestAuth('POST', 'sign-in', $browser, headers: ['CONTENT_TYPE' => 'text/plain']), 415, 'unsupported_media_type');
        foreach (['{"login":', '{"login":"one","l\u006fgin":"two"}', '{"extra":{"name":"a","name":"b"}}'] as $body) {
            $this->assertError($this->requestAuth('POST', 'sign-in', $browser, $body), 400, 'malformed_request');
        }

        $invalid = $this->requestAuth('POST', 'sign-in', $browser, ['login' => 1, 'extra/~' => false])
            ->assertUnprocessable()->assertHeader('Cache-Control', 'no-store')
            ->assertJsonPath('error.code', 'invalid_input');
        $this->assertSame(['/login', '/password', '/extra~1~0'], array_column($invalid->json('error.fields'), 'pointer'));
        $this->assertSame(['invalid_type', 'required', 'unexpected_field'], array_column($invalid->json('error.fields'), 'code'));

        $this->requestAuth('POST', 'sign-in', $browser, ['login' => 'invalid', 'password' => self::PASSWORD])
            ->assertUnprocessable()->assertJsonPath('error.fields.0.code', 'invalid_format');
        $this->requestAuth('POST', 'sign-in', $browser, [
            'login' => str_repeat('a', 240).'@example.invalid', 'password' => str_repeat(' ', 1025),
        ])->assertUnprocessable()
            ->assertJsonPath('error.fields.0.code', 'too_long')->assertJsonPath('error.fields.1.code', 'too_long');
    }

    public function test_invalid_credentials_and_sliding_throttle(): void
    {
        $browser = $this->startBrowser();
        $officer = $this->officer();
        $disabled = $this->officer(['status' => 'disabled']);
        foreach ([$this->signIn($browser, $disabled), $this->requestAuth('POST', 'sign-in', $browser, [
            'login' => 'unknown@example.invalid', 'password' => self::PASSWORD,
        ])] as $response) {
            $this->assertError($response, 401, 'invalid_credentials');
            $this->assertSame('Sign-in failed.', $response->json('error.message'));
        }

        $invalid = ['login' => $officer->email, 'password' => trim(self::PASSWORD)];
        $this->assertError($this->requestAuth('POST', 'sign-in', $browser, $invalid), 401, 'invalid_credentials');
        $this->travel(40)->seconds();
        for ($attempt = 0; $attempt < 4; $attempt++) {
            $this->requestAuth('POST', 'sign-in', $browser, $invalid)->assertUnauthorized();
        }
        $this->signIn($browser, $officer)->assertTooManyRequests()->assertHeader('Retry-After', '20');
        $this->travel(20)->seconds();
        $this->signIn($browser, $officer)->assertOk();
    }

    public function test_ip_budget_is_shared_by_browser_session_endpoints(): void
    {
        $browser = $this->startBrowser();
        for ($attempt = 1; $attempt < 60; $attempt++) {
            $this->requestAuth('GET', 'session', $browser)->assertUnauthorized();
        }
        $limited = $this->requestAuth('POST', 'sign-out', $browser);
        $this->assertError($limited, 429, 'throttled');
        $limited->assertHeader('Retry-After', '60');

        $this->travel(20)->seconds();
        $body = ['login' => 'unknown@example.invalid', 'password' => self::PASSWORD];
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->requestAuth('POST', 'sign-in', $browser, $body, headers: ['REMOTE_ADDR' => '192.0.2.2'])->assertUnauthorized();
        }
        $this->requestAuth('POST', 'sign-in', $browser, $body)->assertTooManyRequests()->assertHeader('Retry-After', '60');
    }

    public function test_current_policy_and_expired_continuation(): void
    {
        $officer = $this->officer();
        $chapter = Chapter::create(['code' => 'SYN-AUTH', 'name' => 'Synthetic chapter']);
        $officer->memberships()->create(['chapter_id' => $chapter->id]);
        $officer->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => 'CHAPTER_HEAD', 'valid_from' => now()->addMinute()]);
        $first = $this->signIn($this->startBrowser(), $officer)->assertOk()->assertJsonPath('data.state', 'authenticated');
        $this->travel(1)->minute();
        $demoted = $this->requestAuth('GET', 'session', $first)->assertOk()->assertJsonPath('data.next_step', 'enroll_authenticator');
        $this->assertSame(now()->addMinutes(10)->toISOString(), $demoted->json('data.expires_at'));
        $this->assertSame($this->cookies($first), $this->cookies($this->startBrowser($first)));
        $this->travel(9)->minutes();
        $this->requestAuth('GET', 'session', $first)->assertExactJson($demoted->json());
        $this->travel(1)->minute();
        $this->requestAuth('GET', 'session', $first)->assertUnauthorized();

        $this->signIn($this->startBrowser(), $officer)->assertOk()->assertJsonPath('data.next_step', 'enroll_authenticator');
        $enrolled = $this->officer();
        $enrolled->mfaCredential()->create(['secret' => 'synthetic-test-seed', 'is_confirmed' => true]);
        $this->signIn($this->startBrowser(), $enrolled)->assertOk()->assertJsonPath('data.next_step', 'challenge_authenticator');

        $provider = $this->officer();
        DB::table('provider_role_grants')->insert([
            'id' => (string) Str::uuid(), 'user_id' => $provider->id, 'role_code' => 'provisioner',
            'granted_by_user_id' => $officer->id, 'starts_at' => now(), 'reason' => 'Synthetic grant',
        ]);
        $this->signIn($this->startBrowser(), $provider)->assertOk()->assertJsonPath('data.next_step', 'enroll_authenticator');
    }

    public function test_replay_is_bound_to_current_browser_and_sign_out_revokes_it(): void
    {
        $officer = $this->officer();
        $intent = (string) Str::uuid();
        $anonymous = $this->startBrowser();
        $current = $this->signIn($anonymous, $officer, $intent)->assertOk();
        $this->signIn($anonymous, $officer, $intent)->assertStatus(419);

        $other = $this->signIn($this->startBrowser(), $officer)->assertOk();
        $this->signIn($other, $officer, $intent)->assertConflict()->assertJsonPath('error.code', 'session_state_conflict');
        $this->travel(1)->minute();

        $replay = $this->signIn($current, $officer, $intent)->assertOk()->assertHeader('X-Action-Replayed', 'true')
            ->assertExactJson($current->json());
        $this->assertSame($this->cookies($current), $this->cookies($replay));
        $this->requestAuth('POST', 'sign-in', $current, ['login' => $officer->email, 'password' => 'changed'], $intent)
            ->assertConflict()->assertJsonPath('error.code', 'action_key_conflict');

        $signOut = $this->requestAuth('POST', 'sign-out', $current)->assertNoContent()->assertHeader('Cache-Control', 'no-store');
        $this->assertCount(2, $signOut->headers->all('Set-Cookie'));
        foreach ($signOut->headers->all('Set-Cookie') as $cookie) {
            $this->assertStringContainsString('Max-Age=0', $cookie);
            $this->assertStringContainsString('secure', $cookie);
        }
        $this->requestAuth('GET', 'session', $current)->assertUnauthorized();
        $this->requestAuth('POST', 'sign-out', $current)->assertStatus(419);
        $this->requestAuth('POST', 'sign-out', $this->startBrowser())->assertNoContent();
        $this->requestAuth('GET', 'session', $other)->assertOk();

        $officer->update(['status' => 'disabled', 'version' => 2]);
        $officer->update(['status' => 'enabled', 'version' => 3]);
        $this->assertError($this->signIn($other, $officer), 401, 'invalid_credentials');
        $this->requestAuth('GET', 'session', $other)->assertUnauthorized();
    }

    private function assertError(TestResponse $response, int $status, string $code): void
    {
        $response->assertStatus($status)->assertHeader('Cache-Control', 'no-store')->assertJsonPath('error.code', $code);
        $this->assertTrue(Str::isUuid($response->json('request_id')));
        $this->assertSame(['error', 'request_id'], array_keys($response->json()));
        $this->assertSame(['code', 'message'], array_keys($response->json('error')));
    }

    public function test_mfa_enrollment_requires_the_current_browser_and_promotes_once(): void
    {
        $officer = $this->officer();
        DB::table('provider_role_grants')->insert([
            'id' => (string) Str::uuid(),
            'user_id' => $officer->id,
            'role_code' => 'provisioner',
            'granted_by_user_id' => $officer->id,
            'starts_at' => now(),
            'reason' => 'Synthetic MFA policy fixture',
        ]);
        $continuation = $this->signIn($this->startBrowser(), $officer)->assertOk()
            ->assertJsonPath('data.next_step', 'enroll_authenticator');
        $this->requestAuth('GET', 'recovery-codes', $continuation)->assertForbidden()
            ->assertJsonPath('error.code', 'mfa_incomplete');

        $password = ['password' => self::PASSWORD];
        $beginKey = (string) Str::uuid();
        $pending = $this->requestAuth('POST', 'authenticator/enrollments', $continuation, $password, $beginKey)
            ->assertCreated()->assertHeader('X-Action-Replayed', 'false')->assertHeader('Cache-Control', 'no-store')
            ->assertJsonPath('data.expires_at', now()->addMinutes(5)->toISOString());
        $this->requestAuth('POST', 'authenticator/enrollments', $continuation, $password, $beginKey)
            ->assertCreated()->assertHeader('X-Action-Replayed', 'true')->assertExactJson($pending->json());
        $this->travel(61)->seconds();
        $proof = $password + [
            'enrollment_id' => $pending->json('data.enrollment_id'),
            'authenticator_code' => $this->authenticatorCode($pending->json('data.secret')),
        ];
        $otherBrowser = $this->signIn($this->startBrowser(), $officer)->assertOk();
        $this->requestAuth('POST', 'authenticator/enrollments/confirm', $otherBrowser, $proof)
            ->assertConflict()->assertJsonPath('error.code', 'enrollment_expired');
        $key = (string) Str::uuid();
        $full = $this->requestAuth('POST', 'authenticator/enrollments/confirm', $continuation, $proof, $key)
            ->assertOk()->assertHeader('X-Action-Replayed', 'false')
            ->assertJsonPath('data.session.authentication_method', 'authenticator')
            ->assertJsonPath('data.session.mfa_required', true)->assertJsonCount(10, 'data.recovery_set.codes');
        $this->assertCookiePair($full);
        $this->requestAuth('POST', 'authenticator/enrollments/confirm', $otherBrowser, $proof)
            ->assertConflict()->assertJsonPath('error.code', 'enrollment_expired');
        $this->requestAuth('GET', 'session', $continuation)->assertUnauthorized();
        $this->requestAuth('POST', 'authenticator/enrollments/confirm', $full, $proof, $key)
            ->assertOk()->assertHeader('X-Action-Replayed', 'true')->assertExactJson($full->json());
        $this->requestAuth('GET', 'recovery-codes', $full)->assertOk()
            ->assertJsonPath('data.recovery_set.id', $full->json('data.recovery_set.id'))
            ->assertJsonPath('data.recovery_set.remaining', 10)->assertJsonMissingPath('data.recovery_set.codes');
    }

    public function test_mfa_authenticator_step_is_once_only_across_browsers(): void
    {
        $officer = $this->officer();
        [$seed] = $this->enrollAuthenticator($officer);
        $continuation = $this->signIn($this->startBrowser(), $officer)->assertOk()
            ->assertJsonPath('data.next_step', 'challenge_authenticator');
        $this->requestAuth('POST', 'recovery-codes/rotate', $continuation)->assertForbidden()
            ->assertJsonPath('error.code', 'mfa_incomplete');
        $this->requestAuth('POST', 'authenticator/challenge', $continuation, ['authenticator_code' => 123456])
            ->assertUnprocessable()->assertJsonPath('error.fields.0.pointer', '/authenticator_code');
        $this->requestAuth('POST', 'authenticator/challenge', $continuation, [
            'authenticator_code' => $this->authenticatorCode($seed),
        ])->assertForbidden()->assertJsonPath('error.code', 'invalid_factor');
        $this->travel(61)->seconds();
        $proof = ['authenticator_code' => $this->authenticatorCode($seed, 30)];
        $key = (string) Str::uuid();
        $completed = $this->requestAuth('POST', 'authenticator/challenge', $continuation, $proof, $key)
            ->assertOk()->assertHeader('X-Action-Replayed', 'false')->assertJsonPath('data.authentication_method', 'authenticator');
        $this->requestAuth('GET', 'session', $completed)->assertExactJson($completed->json());
        $this->requestAuth('GET', 'session', $continuation)->assertUnauthorized();
        $replay = $this->requestAuth('POST', 'authenticator/challenge', $completed, $proof, $key)
            ->assertOk()->assertExactJson($completed->json())->assertHeader('X-Action-Replayed', 'true');
        $this->assertSame($this->cookies($completed), $this->cookies($replay));
        $this->requestAuth('POST', 'authenticator/challenge', $completed, $proof)
            ->assertConflict()->assertJsonPath('error.code', 'session_state_conflict');

        $another = $this->signIn($this->startBrowser(), $officer)->assertOk();
        $this->requestAuth('POST', 'authenticator/challenge', $another, $proof, $key)
            ->assertForbidden()->assertJsonPath('error.code', 'invalid_factor');
        $this->requestAuth('GET', 'session', $another)->assertJsonPath('data.state', 'continuation');
        $this->requestAuth('POST', 'authenticator/challenge', $another, [
            'authenticator_code' => $this->authenticatorCode($seed),
        ])->assertOk();
    }

    public function test_mfa_recovery_consumption_rotation_and_secret_delivery_expiry(): void
    {
        $officer = $this->officer();
        [$seed, $full, $confirmation, $confirmationKey] = $this->enrollAuthenticator($officer);
        $set = $full->json('data.recovery_set');
        $this->assertCount(10, array_unique($set['codes']));
        foreach ($set['codes'] as $code) {
            $this->assertMatchesRegularExpression('/^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/', $code);
        }
        $this->travel(61)->seconds();
        $continuation = $this->signIn($this->startBrowser(), $officer);
        $key = (string) Str::uuid();
        $proof = ['recovery_code' => $set['codes'][0]];
        $recovered = $this->requestAuth('POST', 'recovery/challenge', $continuation, $proof, $key)
            ->assertOk()->assertJsonPath('data.authentication_method', 'recovery_code')->assertHeader('X-Action-Replayed', 'false');
        $this->requestAuth('POST', 'recovery/challenge', $recovered, $proof, $key)->assertOk()
            ->assertExactJson($recovered->json())->assertHeader('X-Action-Replayed', 'true');
        $this->requestAuth('POST', 'authenticator/enrollments/confirm', $full, $confirmation, $confirmationKey)
            ->assertConflict()->assertJsonPath('error.code', 'secret_delivery_expired');
        $second = $this->signIn($this->startBrowser(), $officer);
        $this->requestAuth('POST', 'recovery/challenge', $second, $proof)->assertForbidden()
            ->assertJsonPath('error.code', 'invalid_factor');
        $this->requestAuth('GET', 'recovery-codes', $recovered)
            ->assertExactJson(['data' => ['recovery_set' => [
                'id' => $set['id'], 'remaining' => 9, 'created_at' => $set['created_at'], 'expires_at' => $set['expires_at'],
            ]]]);

        $this->travel(61)->seconds();
        $rotation = ['password' => self::PASSWORD, 'authenticator_code' => $this->authenticatorCode($seed)];
        $rotationKey = (string) Str::uuid();
        $this->requestAuth('POST', 'recovery-codes/rotate', $recovered, $rotation + ['expected_recovery_set_id' => null], $rotationKey)
            ->assertConflict()->assertJsonPath('error.code', 'recovery_set_conflict');
        $rotation['expected_recovery_set_id'] = $set['id'];
        $rotated = $this->requestAuth('POST', 'recovery-codes/rotate', $recovered, $rotation, $rotationKey)
            ->assertOk()->assertHeaderMissing('Set-Cookie')->assertHeader('X-Action-Replayed', 'false')
            ->assertJsonPath('data.session.authentication_method', 'authenticator')
            ->assertJsonPath('data.session.expires_at', $recovered->json('data.expires_at'));
        $this->assertNotSame($set['id'], $rotated->json('data.recovery_set.id'));
        $this->requestAuth('POST', 'recovery-codes/rotate', $recovered, $rotation, $rotationKey)
            ->assertOk()->assertExactJson($rotated->json())->assertHeader('X-Action-Replayed', 'true');
        $changed = array_replace($rotation, ['expected_recovery_set_id' => null]);
        $this->requestAuth('POST', 'recovery-codes/rotate', $recovered, $changed, $rotationKey)
            ->assertConflict()->assertJsonPath('error.code', 'action_key_conflict');
        $this->requestAuth('POST', 'recovery/challenge', $second, ['recovery_code' => $set['codes'][1]])
            ->assertForbidden()->assertJsonPath('error.code', 'invalid_factor');
        $this->travel(5)->minutes();
        $this->requestAuth('POST', 'recovery-codes/rotate', $recovered, $rotation, $rotationKey)
            ->assertConflict()->assertJsonPath('error.code', 'secret_delivery_expired');

        $this->requestAuth('POST', 'sign-out', $recovered)->assertNoContent();
        $this->requestAuth('GET', 'recovery-codes', $recovered)->assertUnauthorized();
        $this->artisan('app:reset-mfa', ['--target-id' => $officer->id])->assertSuccessful();
        $this->requestAuth('GET', 'session', $full)->assertUnauthorized();
        $this->requestAuth('POST', 'recovery/challenge', $second, ['recovery_code' => $rotated->json('data.recovery_set.codes.0')])
            ->assertUnauthorized();
    }

    public function test_mfa_proof_throttling_and_continuation_expiry(): void
    {
        $officer = $this->officer();
        [$seed] = $this->enrollAuthenticator($officer);
        $this->travel(61)->seconds();
        $continuation = $this->signIn($this->startBrowser(), $officer);
        $recovery = ['recovery_code' => 'AAAA-AAAA-AAAA-AAAA'];
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->requestAuth('POST', 'recovery/challenge', $continuation, $recovery, headers: ['REMOTE_ADDR' => '192.0.2.42'])
                ->assertForbidden()->assertJsonPath('error.code', 'invalid_factor');
        }
        $key = (string) Str::uuid();
        $proof = ['authenticator_code' => $this->authenticatorCode($seed, 30)];
        $this->requestAuth('POST', 'authenticator/challenge', $continuation, $proof, $key)
            ->assertTooManyRequests()->assertHeader('Retry-After', '60')->assertJsonPath('error.code', 'throttled');
        $this->travel(60)->seconds();
        $this->requestAuth('POST', 'authenticator/challenge', $continuation, $proof, $key)->assertOk();

        $expiring = $this->signIn($this->startBrowser(), $officer)->assertOk();
        $this->travel(10)->minutes();
        $this->requestAuth('POST', 'authenticator/challenge', $expiring, ['authenticator_code' => $this->authenticatorCode($seed)])
            ->assertUnauthorized()->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_mfa_expired_recovery_set_keeps_metadata_and_rejects_its_codes(): void
    {
        $officer = $this->officer();
        [$seed, $full] = $this->enrollAuthenticator($officer);
        $set = $full->json('data.recovery_set');
        $this->travel(365)->days();

        $continuation = $this->signIn($this->startBrowser(), $officer)->assertOk();
        $this->requestAuth('POST', 'recovery/challenge', $continuation, ['recovery_code' => $set['codes'][0]])
            ->assertForbidden()->assertJsonPath('error.code', 'invalid_factor');
        $authenticated = $this->requestAuth('POST', 'authenticator/challenge', $continuation, [
            'authenticator_code' => $this->authenticatorCode($seed),
        ])->assertOk();
        $this->requestAuth('GET', 'recovery-codes', $authenticated)
            ->assertExactJson(['data' => ['recovery_set' => [
                'id' => $set['id'], 'remaining' => 0, 'created_at' => $set['created_at'], 'expires_at' => $set['expires_at'],
            ]]]);
    }

    public function test_mfa_scheduler_erases_expired_pending_secrets_and_deliveries(): void
    {
        $officer = $this->officer();
        $this->enrollAuthenticator($officer);
        $pending = $this->signIn($this->startBrowser(), $this->officer())->assertOk();
        $this->requestAuth('POST', 'authenticator/enrollments', $pending, ['password' => self::PASSWORD])
            ->assertCreated();
        $this->assertDatabaseCount('browser_mfa_receipts', 3);
        $this->assertSame(1, DB::table('browser_mfa_receipts')->whereNotNull('delivery')->count());

        $this->travel(5)->minutes();
        $this->artisan('schedule:run')->assertSuccessful();

        $this->assertSame(0, DB::table('browser_mfa_receipts')->whereNotNull('delivery')->count());
        $this->assertSame(0, DB::table('user_mfa_credentials')->where('is_confirmed', false)->whereNotNull('encrypted_seed')->count());
        $this->assertSame(1, DB::table('user_mfa_credentials')->where('is_confirmed', true)->whereNotNull('encrypted_seed')->count());
    }

    private function enrollAuthenticator(User $officer): array
    {
        $browser = $this->signIn($this->startBrowser(), $officer)->assertOk();
        $password = ['password' => self::PASSWORD];
        $pending = $this->requestAuth('POST', 'authenticator/enrollments', $browser, $password)->assertCreated();
        $seed = $pending->json('data.secret');
        $proof = $password + [
            'enrollment_id' => $pending->json('data.enrollment_id'),
            'authenticator_code' => $this->authenticatorCode($seed),
        ];
        $key = (string) Str::uuid();
        $full = $this->requestAuth('POST', 'authenticator/enrollments/confirm', $browser, $proof, $key)->assertOk();

        return [$seed, $full, $proof, $key];
    }

    private function authenticatorCode(string $seed, int $offset = 0): string
    {
        return TOTP::createFromSecret($seed)->at(now()->timestamp + $offset);
    }

    private function officer(array $attributes = []): User
    {
        return User::create($attributes + [
            'public_id' => (string) Str::uuid(),
            'name' => 'Synthetic officer',
            'email' => Str::uuid().'@example.invalid',
            'password_hash' => Hash::make(self::PASSWORD),
        ]);
    }

    private function startBrowser(?TestResponse $browser = null): TestResponse
    {
        return $this->requestAuth('GET', 'csrf', $browser, headers: ['HTTP_SEC_FETCH_SITE' => 'same-origin'])
            ->assertNoContent();
    }

    private function signIn(TestResponse $browser, User $officer, ?string $key = null): TestResponse
    {
        return $this->requestAuth('POST', 'sign-in', $browser, [
            'login' => strtoupper($officer->email),
            'password' => self::PASSWORD,
        ], $key);
    }

    private function requestAuth(string $method, string $path, ?TestResponse $browser = null, array|string|null $body = null, ?string $key = null, array $headers = []): TestResponse
    {
        $cookies = $browser ? $this->cookies($browser) : [];
        if ($method === 'POST') {
            $headers += [
                'HTTP_ORIGIN' => self::ORIGIN,
                'HTTP_X_ACTION_KEY' => $key ?? (string) Str::uuid(),
                'HTTP_X_XSRF_TOKEN' => $cookies['XSRF-TOKEN'] ?? '',
                'CONTENT_TYPE' => 'application/json',
            ];
        }

        return $this->call($method, self::ORIGIN.'/api/v1/auth/'.$path, [], $cookies, [], $headers,
            is_array($body) ? json_encode($body, JSON_THROW_ON_ERROR) : $body);
    }

    private function cookies(TestResponse $response): array
    {
        return collect($response->headers->getCookies())->mapWithKeys(fn ($cookie) => [$cookie->getName() => $cookie->getValue()])->all();
    }

    private function assertCookiePair(TestResponse $response): void
    {
        $response->assertHeader('Cache-Control', 'no-store')->assertHeaderMissing('Access-Control-Allow-Credentials');
        $this->assertCount(2, $response->headers->all('Set-Cookie'));
        foreach (['ysp_session' => true, 'XSRF-TOKEN' => false] as $name => $httpOnly) {
            $cookie = $response->getCookie($name, false);
            $this->assertTrue($cookie->isSecure());
            $this->assertSame($httpOnly, $cookie->isHttpOnly());
            $this->assertSame('/', $cookie->getPath());
            $this->assertNull($cookie->getDomain());
            $this->assertSame('lax', $cookie->getSameSite());
            $this->assertSame(0, $cookie->getExpiresTime());
        }
    }
}
