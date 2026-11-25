<?php

namespace Tests\Feature\Stage1A;

use App\Models\ActualIssue;
use App\Models\AuditLog;
use App\Models\Chapter;
use App\Models\InternalRf;
use App\Models\OpeningCount;
use App\Models\User;
use App\Services\Shared\CanonicalJson;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
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

    public function test_current_chapter_authority_uses_the_signed_in_officer(): void
    {
        $officer = $this->officer();
        $chapter = Chapter::create(['code' => 'CEBU', 'name' => 'Cebu', 'status' => 'live']);
        $membership = $officer->memberships()->create(['chapter_id' => $chapter->id]);
        $grant = $officer->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => 'COMMITTEE_REQUESTER']);
        $path = self::ORIGIN.'/api/v1/chapters/'.$chapter->id;
        $spoofed = ['HTTP_X_USER_ID' => $officer->id];

        $this->call('GET', $path.'/context', server: $spoofed)->assertUnauthorized()
            ->assertJsonPath('error.code', 'unauthenticated');
        $cookies = $this->cookies($this->signIn($this->startBrowser(), $officer)->assertOk());
        $this->call('GET', $path.'/context', cookies: $cookies, server: ['HTTP_X_USER_ID' => (string) Str::uuid()])
            ->assertOk()->assertHeader('Cache-Control', 'no-store')
            ->assertJsonPath('data.user_id', $officer->id)
            ->assertJsonPath('data.membership.duties', ['COMMITTEE_REQUESTER'])
            ->assertJsonPath('data.membership.duty_grants.0.id', $grant->id);
        $this->call('GET', $path.'/access', cookies: $cookies)->assertOk()
            ->assertJsonPath('data.actions.0.state', 'context_required')
            ->assertJsonPath('data.actions.10.state', 'allowed')
            ->assertJsonPath('data.actions.11.state', 'setup_blocked')
            ->assertJsonPath('data.actions.11.blockers.0.setting_key', 'rf_approval_route');
        $this->call('GET', self::ORIGIN.'/api/v1/auth/memberships?limit=1&limit=2', cookies: $cookies)
            ->assertBadRequest()->assertJsonPath('error.code', 'invalid_selector');
        $membership->update(['membership_status' => 'revoked', 'version' => 2]);
        $this->call('GET', $path.'/context', cookies: $cookies)->assertNotFound()
            ->assertJsonPath('error.code', 'chapter_not_found');
    }

    public function test_current_chapter_authority_scopes_rf_and_actual_issue_history(): void
    {
        $officer = $this->officer();
        $other = $this->officer();
        $chapter = Chapter::create(['code' => 'CEBU', 'name' => 'Cebu']);
        $foreign = Chapter::create(['code' => 'LILOAN', 'name' => 'Liloan']);
        $unit = (string) Str::uuid();
        $officer->memberships()->create(['chapter_id' => $chapter->id]);
        $grant = $officer->dutyGrants()->create([
            'chapter_id' => $chapter->id, 'duty_code' => 'INVENTORY',
            'scope' => ['unit_id' => $unit, 'limit_php' => null],
        ]);
        $rf = InternalRf::create([
            'chapter_id' => $chapter->id, 'requester_user_id' => $other->id,
            'requesting_unit_id' => $unit, 'status' => 'approved',
        ]);
        $private = InternalRf::create(['chapter_id' => $chapter->id, 'requester_user_id' => $other->id, 'requesting_unit_id' => $unit]);
        $outsideScope = InternalRf::create([
            'chapter_id' => $chapter->id, 'requester_user_id' => $other->id,
            'requesting_unit_id' => (string) Str::uuid(), 'status' => 'approved',
        ]);
        $issue = ActualIssue::create([
            'chapter_id' => $chapter->id, 'requisition_id' => $rf->id, 'issue_number' => 'ISSUE-1',
            'recipient_name' => 'Synthetic recipient', 'prepared_by_user_id' => $officer->id,
        ]);
        $cookies = $this->cookies($this->signIn($this->startBrowser(), $officer)->assertOk());
        $path = self::ORIGIN.'/api/v1/chapters/'.$chapter->id;

        $this->call('GET', $path.'/internal-rfs', cookies: $cookies)->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $rf->id);
        $this->call('GET', $path.'/internal-rfs/'.$rf->id.'/history', cookies: $cookies)->assertOk();
        foreach ([$private, $outsideScope] as $hidden) {
            $this->call('GET', $path.'/internal-rfs/'.$hidden->id, cookies: $cookies)->assertNotFound()
                ->assertJsonPath('error.code', 'resource_not_found');
        }
        $this->call('GET', $path.'/actual-issues/'.$issue->id, cookies: $cookies)->assertOk()
            ->assertJsonPath('data.id', $issue->id);
        $this->call('GET', $path.'/actual-issues/'.$issue->id.'/history', cookies: $cookies)->assertOk();
        $this->call('GET', self::ORIGIN.'/api/v1/chapters/'.$foreign->id.'/actual-issues/'.$issue->id, cookies: $cookies)
            ->assertNotFound()->assertJsonPath('error.code', 'chapter_not_found');

        $write = ['HTTP_ORIGIN' => self::ORIGIN, 'HTTP_X_XSRF_TOKEN' => $cookies['XSRF-TOKEN']];
        $this->assertSame(0, Artisan::call('app:set-duty', [
            '--chapter-id' => $chapter->id,
            '--user-id' => $officer->id,
            '--operator-id' => $officer->id,
            '--target-id' => $grant->id,
            '--duty' => 'INVENTORY',
            '--status' => 'revoked',
        ]));
        $this->call('POST', $path.'/actual-issues/'.$issue->id.'/post', cookies: $cookies, server: $write)
            ->assertForbidden()->assertJsonPath('error.code', 'duty_denied');
        $this->assertSame('prepared', $issue->fresh()->status);
        $this->call('GET', $path.'/actual-issues/'.$issue->id.'/history', cookies: $cookies)
            ->assertForbidden()->assertJsonPath('error.code', 'duty_denied');
    }

    public function test_current_chapter_authority_rechecks_session_mfa_and_cursor(): void
    {
        $officer = $this->officer();
        $chapter = Chapter::create(['code' => 'CEBU', 'name' => 'Cebu']);
        $officer->memberships()->create(['chapter_id' => $chapter->id]);
        $officer->memberships()->create(['chapter_id' => Chapter::create(['code' => 'LILOAN', 'name' => 'Liloan'])->id]);
        $browser = $this->signIn($this->startBrowser(), $officer)->assertOk();
        $cookies = $this->cookies($browser);
        $memberships = self::ORIGIN.'/api/v1/auth/memberships?limit=1';
        $firstPage = $this->call('GET', $memberships, cookies: $cookies)->assertOk()->assertJsonCount(1, 'data');
        $next = $memberships.'&cursor='.rawurlencode($firstPage->json('page.next_cursor'));
        $secondPage = $this->call('GET', $next, cookies: $cookies)->assertOk()
            ->assertJsonPath('page.next_cursor', null)->assertJsonCount(1, 'data');
        $this->assertNotSame($firstPage->json('data.0.id'), $secondPage->json('data.0.id'));
        $officer->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => 'INVENTORY']);
        $this->call('GET', $next, cookies: $cookies)->assertConflict()->assertJsonPath('error.code', 'snapshot_stale');

        $officer->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => 'CHAPTER_HEAD']);
        $path = self::ORIGIN.'/api/v1/chapters/'.$chapter->id.'/context';
        $this->call('GET', $path, cookies: $cookies)->assertForbidden()->assertJsonPath('error.code', 'mfa_incomplete');
        $officer->update(['status' => 'disabled', 'version' => 2]);
        $this->call('GET', $path, cookies: $cookies)->assertUnauthorized()->assertJsonPath('error.code', 'unauthenticated');
    }

    public function test_current_chapter_authority_checks_alternate_scope_and_expiry(): void
    {
        $primary = $this->officer();
        $alternate = $this->officer();
        $chapter = Chapter::create(['code' => 'CEBU', 'name' => 'Cebu']);
        $unit = (string) Str::uuid();
        $scope = ['unit_id' => $unit, 'limit_php' => null];
        foreach ([$primary, $alternate] as $officer) {
            $officer->memberships()->create(['chapter_id' => $chapter->id]);
        }
        $primaryGrant = $primary->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => 'INDEPENDENT_REVIEWER', 'scope' => $scope]);
        $grant = $alternate->dutyGrants()->create([
            'chapter_id' => $chapter->id, 'duty_code' => 'INDEPENDENT_REVIEWER', 'is_alternate' => true,
            'replaces_user_id' => $primary->id, 'scope' => $scope,
            'valid_from' => now()->addMinute(), 'valid_until' => now()->addMinutes(2),
        ]);
        $grant->refresh();
        $path = self::ORIGIN.'/api/v1/chapters/'.$chapter->id.'/context';
        $cookies = $this->cookies($this->signIn($this->startBrowser(), $alternate)->assertOk());
        $this->call('GET', $path, cookies: $cookies)->assertOk()->assertJsonPath('data.membership.duties', []);
        $this->travel(1)->minute();
        $this->call('GET', $path, cookies: $cookies)->assertOk()->assertJsonPath('data.membership.duties', []);
        AuditLog::create([
            'chapter_id' => $chapter->id, 'user_id' => $primary->id, 'action' => 'controlled:setAlternate',
            'entity_type' => 'setAlternate', 'entity_id' => $grant->id,
            'details' => [
                'grant_sha256' => $grant->approvalDigest(), 'decision_scope_reference' => 'synthetic-count',
                'approvals' => [['id' => (string) Str::uuid(), 'authority' => 'CHAPTER_HEAD']],
            ],
        ]);
        $current = $this->call('GET', $path, cookies: $cookies)->assertOk()->assertJsonPath('data.membership.duty_grants.0.id', $grant->id);
        $primaryGrant->update(['status' => 'revoked', 'version' => 2]);
        $revoked = $this->call('GET', $path, cookies: $cookies)->assertOk()->assertJsonPath('data.membership.duties', []);
        $this->assertGreaterThan($current->json('data.membership.authority_version'), $revoked->json('data.membership.authority_version'));
        $primaryGrant->update(['status' => 'active', 'version' => 3]);
        $this->travel(1)->minute();
        $this->call('GET', $path, cookies: $cookies)->assertOk()->assertJsonPath('data.membership.duties', []);
    }

    public function test_current_chapter_authority_projects_verified_setup_and_blocks_rf_submission(): void
    {
        $officer = $this->officer();
        $chapter = Chapter::create(['code' => 'CEBU', 'name' => 'Cebu']);
        $officer->memberships()->create(['chapter_id' => $chapter->id]);
        $officer->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => 'COMMITTEE_REQUESTER']);
        $rf = InternalRf::create(['chapter_id' => $chapter->id, 'requester_user_id' => $officer->id]);
        $policy = $chapter->policyRecords()->create([
            'policy_code' => 'rf_approval_route', 'effective_from' => now(),
            'rules_json' => ['routes' => [], 'approval_owner' => 'CHAPTER_HEAD'],
        ]);
        $path = self::ORIGIN.'/api/v1/chapters/'.$chapter->id;
        $cookies = $this->cookies($this->signIn($this->startBrowser(), $officer)->assertOk());
        $this->call('GET', $path.'/access', cookies: $cookies)->assertOk()
            ->assertJsonPath('data.actions.11.blockers.0.state', 'unapproved');
        $this->call('POST', $path.'/internal-rfs/'.$rf->id.'/submit', cookies: $cookies,
            server: ['HTTP_ORIGIN' => self::ORIGIN, 'HTTP_X_XSRF_TOKEN' => $cookies['XSRF-TOKEN']])
            ->assertConflict()->assertJsonPath('error.code', 'setup_blocked')
            ->assertJsonPath('setup_blockers.0.state', 'unapproved')->assertJsonPath('current', null);

        $routes = ['routes' => [[
            'requesting_unit_id' => (string) Str::uuid(), 'primary_approver_grant_id' => (string) Str::uuid(),
            'alternate_authorization_ids' => [],
        ]]];
        $policy->update(['rules_json' => $routes, 'policy_version' => 2]);
        AuditLog::create([
            'chapter_id' => $chapter->id, 'user_id' => $officer->id, 'action' => 'controlled:recordPolicy',
            'entity_type' => 'recordPolicy', 'entity_id' => $policy->id,
            'details' => [
                'version' => 2, 'value_sha256' => CanonicalJson::sha256($routes), 'subject_id' => null,
                'value_schema_reference' => '#/components/schemas/RfApprovalRoutePolicyValue',
                'approvals' => [['id' => (string) Str::uuid(), 'authority' => 'CHAPTER_HEAD']],
            ],
        ]);
        $this->call('GET', $path.'/access', cookies: $cookies)->assertOk()
            ->assertJsonPath('data.actions.11.state', 'context_required')
            ->assertJsonPath('data.actions.11.blockers', []);
    }

    public function test_current_chapter_authority_does_not_allow_head_to_sign_the_finance_slot(): void
    {
        $head = $this->officer();
        $chapter = Chapter::create(['code' => 'CEBU', 'name' => 'Cebu']);
        $head->memberships()->create(['chapter_id' => $chapter->id]);
        $head->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => 'CHAPTER_HEAD']);
        $ipc = OpeningCount::create(['chapter_id' => $chapter->id, 'created_by' => $head->id, 'status' => 'AWAITING_AUTHORIZATION']);
        [, $browser] = $this->enrollAuthenticator($head);
        $cookies = $this->cookies($browser);
        $path = self::ORIGIN.'/api/v1/chapters/'.$chapter->id.'/ipcs/'.$ipc->id.'/authorizations';
        $this->call('POST', $path, cookies: $cookies, server: [
            'HTTP_ORIGIN' => self::ORIGIN, 'HTTP_X_XSRF_TOKEN' => $cookies['XSRF-TOKEN'], 'CONTENT_TYPE' => 'application/json',
            'HTTP_X_ACTION_KEY' => (string) Str::uuid(),
        ], content: json_encode([
            'expected_revision' => 1, 'material_version' => 1, 'duty' => 'FINANCE', 'signed_at' => now()->toISOString(),
        ], JSON_THROW_ON_ERROR))->assertForbidden()->assertJsonPath('error.code', 'duty_denied');
        $this->assertNull($ipc->fresh()->authorized_finance_by);
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
