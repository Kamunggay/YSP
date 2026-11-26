<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\InventoryCustody\InventoryFingerprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use stdClass;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

final class P24ReportsQueuesAndSevenViewsTest extends TestCase
{
    /** @var array<string, string> */
    private array $cookieJar = [];

    /** @var array<string, int> */
    private array $codeCursor = [];

    public function test_seven_stock_views_queue_ordering_and_no_read_mutations(): void
    {
        $f = $this->seedFixture();
        $cid = $f['chapter_id'];

        $this->signInAs($f['head_email'], $f['password'], $this->nextCode($f['head_email'], $f['head_codes']));
        // 1. Seven stock views must keep warehouse usable (20), free available (11 = 20 - 4 RF - 5 SO), RF (4), SO (5), booth (7), quarantined (3), inbound (0) strictly separate
        $this->req('GET', "/api/v1/chapters/{$cid}/reports/stock-views")->assertOk()
            ->assertJsonPath('views.usable_on_hand_qty', '20')
            ->assertJsonPath('views.available_to_allocate_qty', '11')
            ->assertJsonPath('views.rf_reserved_qty', '4')
            ->assertJsonPath('views.so_reserved_qty', '5')
            ->assertJsonPath('views.booth_custody_qty', '7')
            ->assertJsonPath('views.quarantined_qty', '3')
            ->assertJsonPath('views.inbound_po_qty', '0');

        // 2. Enqueue alerts and verify uncertain-first ordering & bucket filtering without read mutations
        $this->req('POST', "/api/v1/chapters/{$cid}/reports/alerts", [
            'bucket' => 'needs_my_action', 'title' => 'Routine RF check', 'required_duty' => 'RF_APPROVER', 'urgency_rank' => 5, 'is_uncertain_outcome' => false,
        ], 'wq-1')->assertStatus(201);
        $this->req('POST', "/api/v1/chapters/{$cid}/reports/alerts", [
            'bucket' => 'needs_my_action', 'title' => 'Reconcile uncertain SO clock', 'required_duty' => 'FINANCE', 'urgency_rank' => 30, 'is_uncertain_outcome' => true,
        ], 'wq-2')->assertStatus(201);
        $this->req('POST', "/api/v1/chapters/{$cid}/reports/alerts", [
            'bucket' => 'waiting_on_others', 'title' => 'Awaiting supplier DR', 'required_duty' => 'PURCHASING', 'urgency_rank' => 10, 'is_uncertain_outcome' => false,
        ], 'wq-3')->assertStatus(201);

        $ws = $this->req('GET', "/api/v1/chapters/{$cid}/reports/workspace?bucket=needs_my_action");
        $ws->assertOk()->assertJsonPath('mutations_applied', false)->assertJsonCount(2, 'queue_items');
        $this->assertSame('Reconcile uncertain SO clock', $ws->json('queue_items.0.title'));
        $this->assertSame('Routine RF check', $ws->json('queue_items.1.title'));

        // Cursor pagination across all 3 queue items
        $p1 = $this->req('GET', "/api/v1/chapters/{$cid}/reports/workspace?limit=2")->assertOk()->assertJsonCount(2, 'queue_items');
        $cur = (string) $p1->json('next_cursor');
        $this->assertStringStartsWith('cur_', $cur);
        $this->req('GET', "/api/v1/chapters/{$cid}/reports/workspace?limit=2&cursor={$cur}")->assertOk()->assertJsonCount(1, 'queue_items')->assertJsonPath('next_cursor', null);
    }

    public function test_csv_formula_sanitization_pdf_basis_and_revoked_duty_retry_guard(): void
    {
        $f = $this->seedFixture();
        $cid = $f['chapter_id'];

        $this->signInAs($f['fin_email'], $f['password'], $this->nextCode($f['fin_email'], $f['fin_codes']));

        // CSV with formula injection attempt neutralized with leading single quote
        $csvRes = $this->req('POST', "/api/v1/chapters/{$cid}/reports/generate", [
            'report_group' => 'finance_booth', 'report_code' => 'FIN-SUMMARY', 'date_basis' => 'actual_occurrence',
            'period_from' => '2026-11-01', 'period_to' => '2026-11-30', 'format' => 'csv',
            'extra_rows' => [['label' => '=SUM(A1:A2)', 'value' => '+100']],
        ], 'rep-csv-1')->assertStatus(201)->assertJsonPath('action_result', 'success');
        $csvBody = (string) $csvRes->json('data.job.content_text');
        $this->assertStringContainsString("\"'=SUM(A1:A2)\"", $csvBody);
        $this->assertStringContainsString("\"'+100\"", $csvBody);

        // Simulated failed PDF report, then Finance retries without reposting side effects
        $failRes = $this->req('POST', "/api/v1/chapters/{$cid}/reports/generate", [
            'report_group' => 'finance_booth', 'report_code' => 'SO-REGISTER', 'date_basis' => 'entry_verification_posting',
            'period_from' => '2026-11-01', 'period_to' => '2026-11-30', 'format' => 'pdf', 'simulate_failure' => true,
        ], 'rep-pdf-fail')->assertOk()->assertJsonPath('data.job.status', 'failed')->assertJsonPath('data.recoverable', true);
        $jobId = (string) $failRes->json('data.job.job_id');

        $this->req('POST', "/api/v1/chapters/{$cid}/reports/jobs/{$jobId}/retry", ['expected_row_version' => 1], 'rep-retry-ok')
            ->assertOk()->assertJsonPath('action_result', 'success')->assertJsonPath('data.reposted_effect', false)->assertJsonPath('data.job.status', 'retried');

        // Seed another failed job, then revoke FINANCE grant and verify retry fails 403 ForbiddenResult!
        $fail2 = (string) $this->req('POST', "/api/v1/chapters/{$cid}/reports/generate", [
            'report_group' => 'finance_booth', 'report_code' => 'OR-LEDGER', 'date_basis' => 'actual_occurrence',
            'period_from' => '2026-11-01', 'period_to' => '2026-11-30', 'format' => 'pdf', 'simulate_failure' => true,
        ], 'rep-pdf-fail-2')->json('data.job.job_id');

        $finRoleId = (int) DB::table('roles')->where('code', 'FINANCE')->value('id');
        DB::table('duty_grants')->where('chapter_id', $cid)->where('membership_id', $f['fin_membership_id'])->where('role_id', $finRoleId)
            ->update(['revoked_at' => now()->format('Y-m-d H:i:s.u')]);

        $this->req('POST', "/api/v1/chapters/{$cid}/reports/jobs/{$fail2}/retry", [], 'rep-retry-revoked')
            ->assertStatus(403)->assertJsonPath('action_result', 'forbidden')->assertJsonPath('blocking_reason.code', 'DUTY_REVOKED_OR_MISSING');
    }

    /** @return array<string, mixed> */
    private function seedFixture(): array
    {
        $sfx = strtolower(Str::random(8));
        $pw = 'TestPassword#2026!';
        $hash = password_hash($pw, PASSWORD_BCRYPT, ['cost' => 4]);
        $now = now()->format('Y-m-d H:i:s.u');

        $head = $this->mkUser("head.{$sfx}@ysp.local", 'Chapter Head', $hash, $now);
        $fin = $this->mkUser("fin.{$sfx}@ysp.local", 'Finance User', $hash, $now);
        $orgId = DB::table('organizations')->insertGetId(['name' => "Org {$sfx}"]);
        $cid = DB::table('chapters')->insertGetId(['organization_id' => $orgId, 'code' => 'CEB', 'name' => 'Cebu', 'status' => 'live', 'row_version' => 1, 'provisioned_by_user_id' => $head['id'], 'updated_at' => $now]);

        $finMid = 0;
        foreach ([[$head['id'], ['CHAPTER_HEAD']], [$fin['id'], ['FINANCE', 'COMMITTEE_REQUESTER']]] as [$uid, $roles]) {
            $mid = DB::table('memberships')->insertGetId(['chapter_id' => $cid, 'user_id' => $uid, 'status' => 'active', 'authority_version' => 1, 'authorized_by_user_id' => $head['id'], 'authorized_at' => $now]);
            if ($uid === $fin['id']) {
                $finMid = $mid;
            }
            foreach ($roles as $rc) {
                $rid = (int) DB::table('roles')->where('code', $rc)->value('id');
                DB::table('duty_grants')->insert(['chapter_id' => $cid, 'membership_id' => $mid, 'role_id' => $rid, 'scope_kind' => 'chapter', 'starts_at' => now()->subMinute()->format('Y-m-d H:i:s.u')]);
            }
        }

        $uId = DB::table('units')->insertGetId(['chapter_id' => $cid, 'code' => 'PC', 'name' => 'Piece', 'quantity_scale' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        $iId = DB::table('items')->insertGetId(['chapter_id' => $cid, 'sku' => 'TOTEBAG', 'name' => 'YSP Tote', 'item_kind' => 'saleable', 'base_unit_id' => $uId, 'reorder_point' => '5.000000', 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        $vId = DB::table('item_variants')->insertGetId(['chapter_id' => $cid, 'item_id' => $iId, 'variant_code' => 'STD', 'name' => 'Standard', 'active' => true, 'created_at' => $now, 'updated_at' => $now]);

        $whId = DB::table('stock_locations')->insertGetId(['chapter_id' => $cid, 'code' => 'WH-1', 'name' => 'Warehouse', 'location_kind' => 'warehouse', 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        $boothId = DB::table('stock_locations')->insertGetId(['chapter_id' => $cid, 'code' => 'BTH-1', 'name' => 'Booth 1', 'location_kind' => 'booth', 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        $usableId = (int) DB::table('stock_conditions')->where('code', 'usable')->value('id');
        $dmgId = (int) DB::table('stock_conditions')->where('code', 'damaged')->value('id');
        $lotId = DB::table('stock_lots')->insertGetId(['chapter_id' => $cid, 'item_variant_id' => $vId, 'source_kind' => 'opening', 'source_reference' => 'IPC-24', 'received_at' => $now, 'initial_quantity' => '30', 'unit_scale' => 0, 'created_at' => $now]);

        DB::table('stock_positions')->insert(['chapter_id' => $cid, 'item_variant_id' => $vId, 'stock_location_id' => $whId, 'stock_condition_id' => $usableId, 'stock_lot_id' => $lotId, 'unit_scale' => 0, 'on_hand_qty' => '20', 'reserved_qty' => '4', 'blocked_qty' => '4', 'position_version' => 1, 'updated_at' => $now]);
        DB::table('stock_positions')->insert(['chapter_id' => $cid, 'item_variant_id' => $vId, 'stock_location_id' => $boothId, 'stock_condition_id' => $usableId, 'stock_lot_id' => $lotId, 'unit_scale' => 0, 'on_hand_qty' => '7', 'reserved_qty' => '0', 'blocked_qty' => '0', 'position_version' => 1, 'updated_at' => $now]);
        DB::table('stock_positions')->insert(['chapter_id' => $cid, 'item_variant_id' => $vId, 'stock_location_id' => $whId, 'stock_condition_id' => $dmgId, 'stock_lot_id' => $lotId, 'unit_scale' => 0, 'on_hand_qty' => '3', 'reserved_qty' => '0', 'blocked_qty' => '0', 'position_version' => 1, 'updated_at' => $now]);
        DB::table('sale_stock_pools')->insert(['chapter_id' => $cid, 'item_variant_id' => $vId, 'unit_scale' => 0, 'unit_price' => '150.00', 'max_discount_amount' => '10.00', 'so_unpaid_reserved_qty' => '2.000000', 'so_paid_reserved_qty' => '3.000000', 'row_version' => 1, 'updated_at' => $now]);

        return ['chapter_id' => $cid, 'fin_membership_id' => $finMid, 'password' => $pw, 'head_email' => $head['email'], 'head_codes' => $head['codes'], 'fin_email' => $fin['email'], 'fin_codes' => $fin['codes']];
    }

    /** @return array{id: int, email: string, codes: list<string>} */
    private function mkUser(string $email, string $name, string $hash, string $now): array
    {
        $id = DB::table('users')->insertGetId(['public_id' => InventoryFingerprint::newPublicId(), 'name' => $name, 'email' => $email, 'email_key' => $email, 'password_hash' => $hash, 'status' => 'active', 'auth_version' => 1, 'mfa_secret_ciphertext' => Crypt::encryptString('JBSWY3DPEHPK3PXP'), 'mfa_confirmed_at' => $now, 'created_at' => $now, 'updated_at' => $now]);
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
