<?php

namespace Tests\Feature\Stage1A;

use App\Models\AuditLog;
use App\Models\Chapter;
use App\Models\DutyGrant;
use App\Models\User;
use App\Services\Shared\CanonicalJson;
use App\Services\Shared\ReferenceSequenceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use OTPHP\TOTP;
use Symfony\Component\Console\Tester\CommandTester;
use Tests\TestCase;

class ControlledSetupTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'https://ysp.example.invalid';

    private const PASSWORD = 'Synthetic test credential';

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.url' => self::ORIGIN, 'app.key' => 'base64:'.base64_encode(random_bytes(32)), 'hashing.bcrypt.rounds' => 4]);
        $this->freezeSecond();
    }

    public function test_submitted_operator_id_is_not_authentication(): void
    {
        $operator = $this->officer('provisioner');
        $payload = $this->intent('prepareAccount', $operator, self::id(), [
            'login' => 'synthetic@example.invalid',
            'display_name' => 'Synthetic officer',
            'credential_delivery_reference' => 'delivery:synthetic',
        ]);

        $this->approve($payload, $operator, 'PROVIDER_PROVISIONING', retain: false);
        $this->assertSame('operator_denied', $this->execute('prepare-account', $payload)['code']);
        $this->assertDatabaseMissing('users', ['id' => $payload['target_id']]);
        $this->assertDatabaseMissing('controlled_setup_receipts', ['action_key' => $payload['action_key']]);
    }

    public function test_approved_provisioning_is_separate_from_chapter_authority_and_replays_exactly(): void
    {
        $operator = $this->officer('provisioner');
        $approver = $this->officer('provisioner');
        $token = $this->operatorToken($operator);
        $head = self::id();
        $chapter = self::id();
        $member = self::id();
        $grant = self::id();
        $login = 'new-head@example.invalid';

        $account = $this->intent('prepareAccount', $operator, $head, [
            'login' => $login, 'display_name' => 'Initial Chapter Head', 'credential_delivery_reference' => 'delivery:one',
        ]);
        $this->approve($account, $approver, 'PROVIDER_PROVISIONING', retain: false);
        $this->assertSame('approval_required', $this->execute('prepare-account', $account, $token)['code']);
        $this->approve($account, $approver, 'PROVIDER_PROVISIONING');
        $this->assertSame('setup_blocked', $this->execute('prepare-account', $account, $token)['code']);
        DB::table('account_onboarding_deliveries')->insert([
            'reference_hash' => hash('sha256', 'delivery:one'), 'target_id' => $head, 'login' => $login,
            'password_hash' => Hash::make(self::PASSWORD), 'expires_at' => now()->addHour(),
        ]);
        $result = $this->execute('prepare-account', $account, $token);
        $this->assertSame([
            'outcome' => 'committed', 'procedure_id' => 'prepareAccount', 'action_key' => $account['action_key'],
            'target_id' => $head, 'version' => 1, 'audit_id' => $result['audit_id'],
            'committed_at' => now()->toISOString(), 'session_effect' => 'none',
        ], $result);
        $this->assertSame(['outcome' => 'replayed'] + $result, $this->execute('prepare-account', $account, $token));
        $this->assertSame('action_key_conflict', $this->execute('prepare-account', array_replace($account, ['reason' => 'Different']), $token)['code']);
        $this->assertSame($operator->id, AuditLog::findOrFail($result['audit_id'])->user_id);
        $this->get(self::ORIGIN.'/api/v1/operations/by-idempotency-key/'.$account['action_key'])->assertNotFound();
        $this->assertDatabaseHas('account_onboarding_deliveries', ['target_id' => $head, 'password_hash' => null]);

        $appointment = $this->intent('prepareChapter', $operator, $chapter, [
            'reference' => 'SYN-HEAD', 'display_name' => 'Synthetic chapter', 'initial_head_user_id' => $head,
        ]);
        $this->approve($appointment, $approver, 'PROVIDER_PROVISIONING');
        $this->assertSame('committed', $this->execute('prepare-chapter', $appointment, $token)['outcome']);
        $browser = $this->signIn($login);
        $this->read('/auth/memberships', $browser)->assertOk()->assertJsonPath('data', []);

        $membership = $this->intent('setMembership', $operator, $member, [
            'user_id' => $head, 'status' => 'active', 'effective_from' => now()->addMinute()->toISOString(),
        ], $chapter);
        $this->approve($membership, $approver, 'PROVIDER_PROVISIONING');
        $this->assertSame('recheck_authority', $this->execute('set-membership', $membership, $token)['session_effect']);
        $this->read('/auth/memberships', $browser)->assertOk()->assertJsonPath('data', []);
        $this->travel(1)->minute();
        $this->read('/auth/memberships', $browser)->assertOk()->assertJsonPath('data.0.chapter.id', $chapter);
        $this->assertDatabaseMissing('duty_grants', ['chapter_id' => $chapter]);

        $duty = $this->intent('setDuty', $operator, $grant, $this->grant($member, 'CHAPTER_HEAD'), $chapter);
        $this->approve($duty, $approver, 'PROVIDER_PROVISIONING');
        $this->assertSame('committed', $this->execute('set-duty', $duty, $token)['outcome']);
        $this->read('/auth/memberships', $browser)->assertForbidden()->assertJsonPath('error.code', 'mfa_incomplete');
        $secondHeadGrant = $this->intent('setDuty', $operator, self::id(), $this->grant($member, 'CHAPTER_HEAD'), $chapter);
        $this->approve($secondHeadGrant, $approver, 'PROVIDER_PROVISIONING');
        $this->assertSame('approval_required', $this->execute('set-duty', $secondHeadGrant, $token)['code']);
        $this->assertSame('replayed', $this->execute('set-duty', $duty, $token)['outcome']);

        $disable = $this->intent('setAccountStatus', $operator, $head, ['status' => 'disabled'], version: 1);
        $this->approve($disable, $approver, 'PROVIDER_PROVISIONING');
        $this->assertSame('revoke_all', $this->execute('set-account-status', $disable, $token)['session_effect']);
        $this->read('/auth/session', $browser)->assertUnauthorized();
        $this->assertSame('replayed', $this->execute('set-account-status', $disable, $token)['outcome']);
        $stale = $this->intent('setAccountStatus', $operator, $head, ['status' => 'enabled'], version: 1);
        $this->approve($stale, $approver, 'PROVIDER_PROVISIONING');
        $this->assertSame('version_conflict', $this->execute('set-account-status', $stale, $token)['code']);
        $this->assertDatabaseMissing('controlled_setup_receipts', ['action_key' => $stale['action_key']]);
        $this->assertDatabaseHas('domain_notification_outbox', ['event_name' => 'stage1.authority.changed.v1', 'target_user_id' => $head]);
        $enable = $this->intent('setAccountStatus', $operator, $head, ['status' => 'enabled'], version: 2);
        $this->approve($enable, $approver, 'PROVIDER_PROVISIONING');
        $this->assertSame('committed', $this->execute('set-account-status', $enable, $token)['outcome']);
        $this->read('/auth/session', $browser)->assertUnauthorized();
        $this->signIn($login)->assertJsonPath('data.next_step', 'enroll_authenticator');

        DB::table('provider_role_grants')->where('user_id', $operator->id)->update(['revoked_at' => now()]);
        $this->assertSame('operator_denied', $this->execute('prepare-account', $account, $token)['code']);
    }

    public function test_scoped_alternate_membership_revocation_and_policy_supersession(): void
    {
        $chapter = Chapter::create(['code' => 'SYN-ACCESS', 'name' => 'Synthetic chapter']);
        $operator = $this->officer();
        $head = $this->officer();
        $finance = $this->officer();
        $primary = $this->officer();
        $alternate = $this->officer();
        $token = $this->operatorToken($operator);
        foreach ([[$head, 'CHAPTER_HEAD'], [$finance, 'FINANCE'], [$primary, 'RF_APPROVER'], [$alternate, 'RECEIVING']] as [$user, $duty]) {
            $member = $user->memberships()->create(['chapter_id' => $chapter->id]);
            $user->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => $duty, 'scope' => ['unit_id' => null, 'limit_php' => '500.00']]);
        }
        $alternateMember = $member;
        $primaryGrant = $primary->dutyGrants()->sole();
        foreach (['setAlternate', 'recordPolicy', 'setMembership', 'setDuty'] as $procedure) {
            DB::table('chapter_setup_entitlements')->insert([
                'user_id' => $operator->id, 'chapter_id' => $chapter->id, 'procedure_id' => $procedure, 'starts_at' => now(),
            ]);
        }

        $unit = self::id();
        DB::table('chapter_organizational_units')->insert(['id' => $unit, 'chapter_id' => $chapter->id]);
        $routeId = self::id();
        $alternateIntent = $this->intent('setAlternate', $operator, self::id(),
            $this->grant($alternateMember->id, 'RF_APPROVER', $unit, now()->addHour()->toISOString()) + [
                'replaces_user_id' => $primary->id, 'decision_scope_reference' => "rf_approval_route:{$routeId}:{$unit}",
            ], $chapter->id);
        $this->approve($alternateIntent, $head, 'CHAPTER_HEAD');
        $this->assertSame('committed', $this->execute('set-alternate', $alternateIntent, $token)['outcome']);
        $this->assertSame($alternateIntent['input']['decision_scope_reference'], DutyGrant::findOrFail($alternateIntent['target_id'])->alternateDecisionScope());
        $route = $this->intent('recordPolicy', $operator, $routeId, [
            'setting_key' => 'rf_approval_route', 'subject_id' => null, 'ownership' => 'operational',
            'value_schema_reference' => '#/components/schemas/RfApprovalRoutePolicyValue',
            'value' => CanonicalJson::encode(['routes' => [[
                'requesting_unit_id' => $unit, 'primary_approver_grant_id' => $primaryGrant->id,
                'alternate_authorization_ids' => [$alternateIntent['target_id']],
            ]]]),
            'effective_from' => now()->toISOString(), 'effective_until' => null,
        ], $chapter->id);
        $this->approve($route, $head, 'CHAPTER_HEAD');
        $this->assertSame('committed', $this->execute('record-policy', $route, $token)['outcome']);

        $valuation = $this->intent('recordPolicy', $operator, self::id(), [
            'setting_key' => 'valuation_rounding', 'subject_id' => null, 'ownership' => 'financial',
            'value_schema_reference' => '#/components/schemas/OpeningValuationPolicyValue',
            'value' => CanonicalJson::encode([
                'currency' => 'PHP', 'unit_value_scale' => 2, 'round_at' => 'accepted_line',
                'rounding_mode' => 'half_even', 'valuation_basis_reference' => 'decision:one',
            ]),
            'effective_from' => now()->toISOString(), 'effective_until' => null,
        ], $chapter->id);
        $session = $this->operatorToken($alternate);
        $this->assertSame('missing', $this->valuationBlocker($chapter, $session));
        $this->approve($valuation, $head, 'CHAPTER_HEAD');
        $this->assertSame('approval_required', $this->execute('record-policy', $valuation, $token)['code']);
        $this->approve($valuation, $finance, 'FINANCE');
        $accepted = $this->execute('record-policy', $valuation, $token);
        $this->assertSame('committed', $accepted['outcome']);

        $revision = $valuation;
        $revision['action_key'] = self::id();
        $revision['expected_version'] = 1;
        $revision['input']['effective_from'] = now()->addMinute()->toISOString();
        $revision['input']['effective_until'] = now()->addMinutes(2)->toISOString();
        $revision['input']['value'] = str_replace('half_even', 'half_up', $revision['input']['value']);
        $this->approve($revision, $finance, 'FINANCE');
        $this->assertSame(2, $this->execute('record-policy', $revision, $token)['version']);
        $history = $chapter->policyRecords()->where('policy_code', 'valuation_rounding')->orderBy('policy_version')->get();
        $this->assertSame(['half_even', 'half_up'], $history->map(fn ($row) => $row->rules_json['rounding_mode'])->all());
        $this->assertSame($revision['input']['effective_from'], $history[0]->effective_until->toISOString());
        $this->assertNull($history[0]->setupEvidence()['input']['effective_until']);

        $this->assertNull($this->valuationBlocker($chapter, $session));
        $this->travel(1)->minute();
        $this->assertNull($this->valuationBlocker($chapter, $session));
        $this->travel(1)->minute();
        $this->assertSame('expired', $this->valuationBlocker($chapter, $session));
        $this->read('/chapters/'.$chapter->id.'/context', $session)->assertOk();

        $receiving = $alternate->dutyGrants()->where('duty_code', 'RECEIVING')->sole();
        $revokeDuty = $this->intent('setDuty', $operator, $receiving->id, $this->grant($alternateMember->id, 'RECEIVING'), $chapter->id, 1);
        $revokeDuty['input']['status'] = 'revoked';
        $this->approve($revokeDuty, $head, 'CHAPTER_HEAD');
        $this->assertSame('setup_blocked', $this->execute('set-duty', $revokeDuty, $token)['code']);
        $revokeDuty['input']['scope']['limit_php'] = '500.00';
        $this->approve($revokeDuty, $head, 'CHAPTER_HEAD');
        $this->assertSame('committed', $this->execute('set-duty', $revokeDuty, $token)['outcome']);
        $this->assertDatabaseHas('duty_grants', ['id' => $receiving->id, 'status' => 'revoked']);
        $revoke = $this->intent('setMembership', $operator, $alternateMember->id, [
            'user_id' => $alternate->id, 'status' => 'revoked', 'effective_from' => now()->toISOString(),
        ], $chapter->id, 1);
        $this->approve($revoke, $head, 'CHAPTER_HEAD');
        $this->assertSame('committed', $this->execute('set-membership', $revoke, $token)['outcome']);
        $this->read('/chapters/'.$chapter->id.'/context', $session)->assertNotFound()->assertJsonPath('error.code', 'chapter_not_found');
        $this->assertDatabaseHas('duty_grants', ['id' => $alternateIntent['target_id'], 'status' => 'revoked']);
    }

    public function test_reset_requires_independent_verification_and_fences_existing_cookies(): void
    {
        $operator = $this->officer('recovery_operator');
        $approver = $this->officer('recovery_operator');
        $officer = $this->officer('provisioner');
        $operatorToken = $this->operatorToken($operator);
        $officerToken = $this->operatorToken($officer);
        $payload = $this->intent('resetMfa', $operator, $officer->id, [
            'identity_verification_reference' => 'verification:one',
            'verified_by_user_id' => $approver->id,
            'verified_at' => now()->toISOString(),
            'lost_factor_reason' => 'Authenticator unavailable',
        ], version: 1);
        $this->approve($payload, $approver, 'PROVIDER_RECOVERY');
        $this->assertSame('identity_verification_required', $this->execute('reset-mfa', $payload, $operatorToken)['code']);
        $this->read('/auth/session', $officerToken)->assertOk();

        AuditLog::create([
            'user_id' => $approver->id, 'entity_id' => $officer->id, 'entity_type' => 'resetMfa',
            'action' => 'setup:identityVerification', 'details' => [
                'verified_at' => $payload['input']['verified_at'], 'reference' => $payload['input']['identity_verification_reference'],
                'lost_factor_reason' => $payload['input']['lost_factor_reason'], 'expires_at' => now()->addHour()->toISOString(),
            ],
        ]);
        $result = $this->execute('reset-mfa', $payload, $operatorToken);
        $this->assertSame('require_reenrollment', $result['session_effect']);
        $this->assertSame(['outcome' => 'replayed'] + $result, $this->execute('reset-mfa', $payload, $operatorToken));
        $this->read('/auth/session', $officerToken)->assertUnauthorized();
        $this->signIn($officer->email)->assertJsonPath('data.next_step', 'enroll_authenticator');
    }

    public function test_reference_families_are_independent_and_failed_writes_roll_back(): void
    {
        $chapter = Chapter::create(['code' => 'SYN-REF', 'name' => 'Synthetic chapter']);
        $operator = $this->officer();
        $operator->mfaCredential()->delete();
        $head = $this->officer();
        $head->memberships()->create(['chapter_id' => $chapter->id]);
        $head->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => 'CHAPTER_HEAD']);
        DB::table('chapter_setup_entitlements')->insert([
            'user_id' => $operator->id, 'chapter_id' => $chapter->id, 'procedure_id' => 'recordPolicy', 'starts_at' => now(),
        ]);
        $enrollment = $this->signIn($operator->email)->assertJsonPath('data.next_step', 'enroll_authenticator');
        $pending = $this->authPost('authenticator/enrollments', $enrollment, ['password' => self::PASSWORD])->assertCreated();
        $authenticated = $this->authPost('authenticator/enrollments/confirm', $enrollment, [
            'password' => self::PASSWORD,
            'enrollment_id' => $pending->json('data.enrollment_id'),
            'authenticator_code' => TOTP::createFromSecret($pending->json('data.secret'))->at(now()->timestamp),
        ])->assertOk();
        $token = $authenticated->getCookie('ysp_session', false)->getValue();
        $opening = $this->intent('recordPolicy', $operator, self::id(), [
            'setting_key' => 'reference_series', 'ownership' => 'operational', 'subject_id' => null,
            'value_schema_reference' => '#/components/schemas/OpeningReferencePolicyValue',
            'value' => CanonicalJson::encode(['ipc_prefix' => 'SYIPC', 'rm_prefix' => 'SYRM', 'minimum_digits' => 7]),
            'effective_from' => now()->toISOString(), 'effective_until' => null,
        ], $chapter->id);
        $this->approve($opening, $head, 'CHAPTER_HEAD');

        $failAudit = true;
        AuditLog::creating(function (AuditLog $audit) use (&$failAudit) {
            if ($failAudit && $audit->action === 'controlled:recordPolicy') {
                throw new \PDOException('Synthetic audit-write failure');
            }
        });
        $this->assertSame('unavailable', $this->execute('record-policy', $opening, $token)['code']);
        $this->assertDatabaseMissing('policy_records', ['id' => $opening['target_id']]);
        $this->assertDatabaseMissing('controlled_setup_receipts', ['action_key' => $opening['action_key']]);
        $this->assertDatabaseMissing('domain_notification_outbox', ['resource_id' => $chapter->id]);
        $failAudit = false;
        $this->assertSame('committed', $this->execute('record-policy', $opening, $token)['outcome']);

        $rf = $this->intent('recordPolicy', $operator, self::id(), array_replace($opening['input'], [
            'value_schema_reference' => '#/components/schemas/RfReferenceSeriesPolicyValue',
            'value' => CanonicalJson::encode(['document_kind' => 'RF', 'prefix' => 'SYRF', 'sequence_width' => 9, 'year_basis' => 'Asia/Manila']),
        ]), $chapter->id);
        $this->approve($rf, $head, 'CHAPTER_HEAD');
        $this->assertSame('committed', $this->execute('record-policy', $rf, $token)['outcome']);
        $overlap = $this->intent('recordPolicy', $operator, self::id(), $rf['input'], $chapter->id);
        $this->approve($overlap, $head, 'CHAPTER_HEAD');
        $this->assertSame('version_conflict', $this->execute('record-policy', $overlap, $token)['code']);

        $series = app(ReferenceSequenceService::class);
        $this->assertSame(['prefix' => 'SYRF', 'width' => 9, 'policy_id' => $rf['target_id'], 'policy_version' => 1],
            $series->resolveSeriesPolicy($chapter->id, 'RF'));
        $this->assertSame(['prefix' => 'SYIPC', 'width' => 7, 'policy_id' => $opening['target_id'], 'policy_version' => 1],
            $series->resolveSeriesPolicy($chapter->id, 'IPC'));
    }

    private function valuationBlocker(Chapter $chapter, string $token): ?string
    {
        $actions = $this->read('/chapters/'.$chapter->id.'/access', $token)->assertOk()->json('data.actions');
        $post = collect($actions)->firstWhere('action', 'opening_rm.post');

        return collect($post['blockers'])->firstWhere('setting_key', 'valuation_rounding')['state'] ?? null;
    }

    private function grant(string $membership, string $duty, ?string $unit = null, ?string $until = null): array
    {
        return [
            'membership_id' => $membership, 'duty' => $duty, 'status' => 'active',
            'effective_from' => now()->toISOString(), 'effective_until' => $until,
            'scope' => ['unit_id' => $unit, 'limit_php' => null],
        ];
    }

    private function intent(string $procedure, User $operator, string $target, array $input, ?string $chapter = null, int $version = 0): array
    {
        return [
            'procedure_id' => $procedure, 'action_key' => self::id(), 'operator_id' => $operator->id,
            'chapter_id' => $chapter, 'target_id' => $target, 'expected_version' => $version,
            'reason' => 'Approved synthetic setup', 'input' => $input, 'approvals' => [],
        ];
    }

    private function approve(array &$intent, User $approver, string $authority, bool $retain = true): void
    {
        $approval = [
            'id' => self::id(), 'approver_id' => $approver->id, 'authority' => $authority,
            'approved_at' => now()->toISOString(), 'evidence_reference' => 'decision:'.self::id(),
        ];
        if ($retain) {
            AuditLog::create([
                'id' => $approval['id'], 'chapter_id' => $intent['chapter_id'], 'user_id' => $approver->id,
                'action' => 'setup:approval', 'entity_type' => $intent['procedure_id'], 'entity_id' => $intent['target_id'],
                'details' => [
                    'approval' => $approval,
                    'intent_sha256' => CanonicalJson::sha256(array_diff_key($intent, ['action_key' => true, 'approvals' => true])),
                ],
            ]);
        }
        $intent['approvals'] = [$approval];
    }

    private function execute(string $command, array $payload, ?string $token = null): array
    {
        $tester = new CommandTester(Artisan::all()['app:'.$command]);
        if ($token !== null) {
            $tester->setInputs([$token]);
        }
        $exit = $tester->execute(['--payload' => json_encode($payload, JSON_THROW_ON_ERROR)], ['interactive' => $token !== null]);
        $lines = explode("\n", trim($tester->getDisplay(true)));
        $result = json_decode(end($lines), true, flags: JSON_THROW_ON_ERROR);
        $this->assertSame($result['outcome'] === 'rejected' ? 1 : 0, $exit);

        return $result;
    }

    private function officer(?string $role = null): User
    {
        $user = User::create([
            'name' => 'Synthetic officer', 'public_id' => self::id(),
            'email' => self::id().'@example.invalid', 'password_hash' => Hash::make(self::PASSWORD),
        ]);
        $user->mfaCredential()->create(['secret' => '', 'encrypted_seed' => TOTP::generate()->getSecret(), 'is_confirmed' => true]);
        if ($role) {
            DB::table('provider_role_grants')->insert([
                'id' => self::id(), 'user_id' => $user->id, 'granted_by_user_id' => $user->id,
                'role_code' => $role, 'starts_at' => now(), 'reason' => 'Synthetic mandate fixture',
            ]);
        }

        return $user;
    }

    private function operatorToken(User $operator): string
    {
        $browser = $this->signIn($operator->email)->assertJsonPath('data.next_step', 'challenge_authenticator');
        $seed = $operator->mfaCredential()->sole()->encrypted_seed;
        $full = $this->authPost('authenticator/challenge', $browser, [
            'authenticator_code' => TOTP::createFromSecret($seed)->at(now()->timestamp),
        ])->assertOk();

        return $full->getCookie('ysp_session', false)->getValue();
    }

    private function signIn(string $login): TestResponse
    {
        $anonymous = $this->call('GET', self::ORIGIN.'/api/v1/auth/csrf', server: ['HTTP_SEC_FETCH_SITE' => 'same-origin'])->assertNoContent();

        return $this->authPost('sign-in', $anonymous, ['login' => $login, 'password' => self::PASSWORD])->assertOk();
    }

    private function authPost(string $operation, TestResponse $browser, array $body): TestResponse
    {
        return $this->call('POST', self::ORIGIN.'/api/v1/auth/'.$operation,
            cookies: ['ysp_session' => $browser->getCookie('ysp_session', false)->getValue()],
            server: [
                'HTTP_ORIGIN' => self::ORIGIN, 'HTTP_X_ACTION_KEY' => self::id(),
                'HTTP_X_XSRF_TOKEN' => $browser->getCookie('XSRF-TOKEN', false)->getValue(), 'CONTENT_TYPE' => 'application/json',
            ],
            content: json_encode($body, JSON_THROW_ON_ERROR));
    }

    private function read(string $path, TestResponse|string $browser): TestResponse
    {
        $token = is_string($browser) ? $browser : $browser->getCookie('ysp_session', false)->getValue();

        return $this->call('GET', self::ORIGIN.'/api/v1'.$path, cookies: ['ysp_session' => $token]);
    }

    private static function id(): string
    {
        return (string) Str::uuid();
    }
}
