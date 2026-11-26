<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\InventoryCustody\InventoryFingerprint;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use stdClass;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

final class P25OperationsMapAndTracerTest extends TestCase
{
    /** @var array<string, string> */
    private array $cookieJar = [];

    /** @var array<string, int> */
    private array $codeCursor = [];

    public function test_illustrative_scenarios_rbac_node_restriction_audit_and_graceful_fallback(): void
    {
        $f = $this->seedFixture();
        $cid = $f['chapter_id'];

        // 1. Authorized chapter reader views map, selects scenario & view, sees explicit ILLUSTRATIVE tag
        $this->signInAs($f['req_email'], $f['password']);
        $this->req('GET', "/api/v1/chapters/{$cid}/operations-map")->assertOk()
            ->assertJsonPath('is_supporting_only', true)
            ->assertJsonPath('illustrative_tag', 'ILLUSTRATIVE SCENARIO — NOT LIVE OPERATIONAL DATA');

        $this->req('POST', "/api/v1/chapters/{$cid}/operations-map/view", [
            'view_code' => 'view_5_scenario_tracer', 'scenario_code' => 'track2_booth_100_30_70', 'expected_row_version' => 1,
        ], 'map-v5')->assertOk()
            ->assertJsonPath('action_result', 'success')
            ->assertJsonPath('data.map.state.active_view', 'view_5_scenario_tracer')
            ->assertJsonPath('data.map.active_scenario_detail.illustrative_tag', 'ILLUSTRATIVE SCENARIO — NOT LIVE OPERATIONAL DATA');

        // Stale row version is rejected with 409 stale
        $this->req('POST', "/api/v1/chapters/{$cid}/operations-map/view", [
            'view_code' => 'view_1_swimlanes', 'scenario_code' => 'track1_so_backorder', 'expected_row_version' => 1,
        ], 'map-v1-stale')->assertStatus(409)->assertJsonPath('action_result', 'stale')->assertJsonPath('blocking_reason.code', 'STALE_RECORD_VERSION');

        // 2. Non-Finance requester inspecting sales_payment_gate gets 403 ForbiddenResult NEUTRAL_SCOPE_RESTRICTED_EXPLANATION without restricted details
        $this->req('GET', "/api/v1/chapters/{$cid}/operations-map/nodes/sales_payment_gate")
            ->assertStatus(403)
            ->assertJsonPath('action_result', 'forbidden')
            ->assertJsonPath('chapter_id', null)
            ->assertJsonPath('blocking_reason.code', 'NEUTRAL_SCOPE_RESTRICTED_EXPLANATION')
            ->assertJsonMissingPath('restricted_details');

        // Provider admin without chapter membership also gets neutral 403
        $this->signInAs($f['prov_email'], $f['password'], $this->nextCode($f['prov_email'], $f['prov_codes']));
        $this->req('GET', "/api/v1/chapters/{$cid}/operations-map/nodes/sales_payment_gate")
            ->assertStatus(403)
            ->assertJsonPath('action_result', 'forbidden')
            ->assertJsonPath('chapter_id', null)
            ->assertJsonPath('blocking_reason.code', 'NEUTRAL_SCOPE_RESTRICTED_EXPLANATION');

        // Finance inspects sales_payment_gate successfully
        $this->signInAs($f['fin_email'], $f['password'], $this->nextCode($f['fin_email'], $f['fin_codes']));
        $this->req('GET', "/api/v1/chapters/{$cid}/operations-map/nodes/sales_payment_gate")
            ->assertOk()
            ->assertJsonPath('node_code', 'sales_payment_gate');
        $this->assertNotNull($this->req('GET', "/api/v1/chapters/{$cid}/operations-map/nodes/sales_payment_gate")->json('restricted_details'));

        // 3. Map failure mode returns MAP_RENDERER_UNAVAILABLE on diagram while text alt toggle & P24 stock views remain live
        $this->signInAs($f['head_email'], $f['password'], $this->nextCode($f['head_email'], $f['head_codes']));
        $this->req('POST', "/api/v1/chapters/{$cid}/operations-map/failure-mode", ['map_unavailable' => true, 'expected_row_version' => 2], 'map-fail-on')->assertOk();
        $this->req('GET', "/api/v1/chapters/{$cid}/operations-map/diagram")->assertStatus(424)
            ->assertJsonPath('code', 'MAP_RENDERER_UNAVAILABLE')
            ->assertJsonPath('text_alternative_available', true);
        $this->req('POST', "/api/v1/chapters/{$cid}/operations-map/text-alternative", ['enabled' => true, 'expected_row_version' => 3], 'map-txt-on')->assertOk()
            ->assertJsonPath('data.map.state.text_alternative_enabled', true);
        $this->req('GET', "/api/v1/chapters/{$cid}/reports/stock-views")->assertOk();

        // 4. Immutable trigger blocks UPDATE/DELETE on operations_map_audit_events
        $audit = DB::table('operations_map_audit_events')->where('chapter_id', $cid)->first();
        $this->assertNotNull($audit);
        $this->expectException(QueryException::class);
        DB::table('operations_map_audit_events')->where('id', (int) $audit->id)->update(['outcome' => 'allowed']);
    }

    /** @return array<string, mixed> */
    private function seedFixture(): array
    {
        $sfx = strtolower(Str::random(8));
        $pw = 'TestPassword#2026!';
        $hash = password_hash($pw, PASSWORD_BCRYPT, ['cost' => 4]);
        $now = now()->format('Y-m-d H:i:s.u');

        $head = $this->mkUser("head.{$sfx}@ysp.local", 'Head', $hash, $now);
        $fin = $this->mkUser("fin.{$sfx}@ysp.local", 'Finance', $hash, $now);
        $req = $this->mkUser("req.{$sfx}@ysp.local", 'Requester', $hash, $now);
        $prov = $this->mkUser("prov.{$sfx}@ysp.local", 'Provider', $hash, $now);

        $orgId = DB::table('organizations')->insertGetId(['name' => "Org {$sfx}"]);
        DB::table('provider_role_grants')->insert(['organization_id' => $orgId, 'user_id' => $prov['id'], 'role_code' => 'provisioner', 'granted_by_user_id' => $head['id'], 'starts_at' => $now, 'reason' => 'P25 GOV-03 isolation test']);
        $cid = DB::table('chapters')->insertGetId(['organization_id' => $orgId, 'code' => 'CEB', 'name' => 'Cebu', 'status' => 'live', 'row_version' => 1, 'provisioned_by_user_id' => $head['id'], 'updated_at' => $now]);

        foreach ([[$head['id'], ['CHAPTER_HEAD']], [$fin['id'], ['FINANCE']], [$req['id'], ['COMMITTEE_REQUESTER']]] as [$uid, $roles]) {
            $mid = DB::table('memberships')->insertGetId(['chapter_id' => $cid, 'user_id' => $uid, 'status' => 'active', 'authority_version' => 1, 'authorized_by_user_id' => $head['id'], 'authorized_at' => $now]);
            foreach ($roles as $rc) {
                $rid = (int) DB::table('roles')->where('code', $rc)->value('id');
                DB::table('duty_grants')->insert(['chapter_id' => $cid, 'membership_id' => $mid, 'role_id' => $rid, 'scope_kind' => 'chapter', 'starts_at' => now()->subMinute()->format('Y-m-d H:i:s.u')]);
            }
        }

        return [
            'chapter_id' => $cid, 'password' => $pw,
            'head_email' => $head['email'], 'head_codes' => $head['codes'],
            'fin_email' => $fin['email'], 'fin_codes' => $fin['codes'],
            'req_email' => $req['email'], 'prov_email' => $prov['email'], 'prov_codes' => $prov['codes'],
        ];
    }

    /** @return array{id: int, email: string, codes: list<string>} */
    private function mkUser(string $email, string $name, string $hash, string $now, bool $mfa = true): array
    {
        $id = DB::table('users')->insertGetId(['public_id' => InventoryFingerprint::newPublicId(), 'name' => $name, 'email' => $email, 'email_key' => $email, 'password_hash' => $hash, 'status' => 'active', 'auth_version' => 1, 'mfa_secret_ciphertext' => $mfa ? Crypt::encryptString('JBSWY3DPEHPK3PXP') : null, 'mfa_confirmed_at' => $mfa ? $now : null, 'created_at' => $now, 'updated_at' => $now]);
        $codes = [];
        for ($i = 1; $i <= 10; $i++) {
            $c = 'ABCD-EFGH-JKLM-NP'.str_pad((string) $i, 2, '0', STR_PAD_LEFT);
            $codes[] = $c;
            DB::table('user_recovery_codes')->insert(['user_id' => $id, 'code_hash' => hash('sha256', $c, true), 'issued_at' => $now]);
        }

        return ['id' => $id, 'email' => $email, 'codes' => $codes];
    }

    /** @param list<string> $codes */
    private function nextCode(string $email, array $codes): string
    {
        $idx = $this->codeCursor[$email] ?? 0;
        $this->codeCursor[$email] = $idx + 1;

        return $codes[$idx];
    }

    private function signInAs(string $email, string $password, ?string $recoveryCode = null): void
    {
        $this->cookieJar = [];
        $this->callHttp('GET', '/csrf-cookie')->assertNoContent();
        $r = $this->callHttp('POST', '/api/v1/session/sign-in', ['email' => $email, 'password' => $password]);
        $r->assertOk();
        if ($r->json('state') === 'mfa_challenge_required' && $recoveryCode !== null) {
            $this->callHttp('POST', '/api/v1/session/mfa/challenge/verify', ['challenge_id' => (string) $r->json('challenge.id'), 'method' => 'recovery_code', 'recovery_code' => $recoveryCode])->assertOk();
        }
    }

    /** @param array<string, mixed>|null $data
     * @return TestResponse<Response> */
    private function req(string $method, string $uri, ?array $data = null, ?string $idem = null): TestResponse
    {
        return $this->callHttp($method, $uri, $data, $idem !== null ? ['Idempotency-Key' => $idem] : []);
    }

    /** @param array<string, mixed>|null $payload
     * @param  array<string, string>  $extra
     * @return TestResponse<Response> */
    private function callHttp(string $method, string $uri, ?array $payload = null, array $extra = []): TestResponse
    {
        $h = ['Accept' => 'application/json', 'Origin' => (string) config('app.url')];
        $raw = null;
        if ($method !== 'GET') {
            $raw = json_encode(($payload === null || $payload === []) ? new stdClass : $payload, JSON_THROW_ON_ERROR);
            $h += ['CONTENT_TYPE' => 'application/json', 'CONTENT_LENGTH' => (string) strlen($raw), 'X-XSRF-TOKEN' => $this->cookieJar['XSRF-TOKEN'] ?? ''];
        }
        $res = $this->call($method, $uri, [], $this->cookieJar, [], $this->transformHeadersToServerVars([...$h, ...$extra]), $raw);
        foreach ($res->headers->getCookies() as $c) {
            if ($c->isCleared() || (string) $c->getValue() === '') {
                unset($this->cookieJar[$c->getName()]);
            } else {
                $this->cookieJar[$c->getName()] = (string) $c->getValue();
            }
        }

        return $res;
    }
}
