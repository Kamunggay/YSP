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

final class P12SalesOrderReviewAndInvoiceTest extends TestCase
{
    /** @var array<string, string> */
    private array $cookieJar = [];

    /** @var array<string, int> */
    private array $codeCursor = [];

    public function test_so_lifecycle_gov05_split_acceptance_non_payment_si_and_cursor(): void
    {
        $f = $this->seedChapterAndPool();
        $cid = $f['chapter_id'];

        $this->signInAs($f['rev_email'], $f['password'], $this->nextCode($f['rev_email'], $f['rev_codes']));
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/pools", [
            'variant_id' => $f['variant_id'], 'unit_price' => '250.00', 'max_discount_amount' => '100.00',
        ], 'so-pool-1')->assertStatus(201)->assertJsonPath('schema_version', '1.0')->assertJsonPath('action_result', 'success');

        $this->signInAs($f['so_email'], $f['password'], $this->nextCode($f['so_email'], $f['so_codes']));
        $soRes = $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders", [
            'variant_id' => $f['variant_id'], 'buyer_name' => 'Walk-in Buyer', 'buyer_contact' => '09170001111',
            'ordered_quantity_value' => '8', 'unit_price' => '250.00', 'discount_amount' => '150.00',
            'estimated_procurement_cost' => '300.00', 'payment_terms' => '48h deposit then 48h pickup', 'fulfillment_arrangement' => 'pickup',
        ], 'so-create-1');
        $soRes->assertStatus(201)->assertJsonPath('data.order.status', 'draft')->assertJsonPath('data.order.net_amount_due', '1850.00');
        $soId = (string) $soRes->json('data.order.so_id');

        // Also create a second draft to exercise HMAC cursor pagination on GET /sales
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders", [
            'variant_id' => $f['variant_id'], 'buyer_name' => 'Second Buyer', 'buyer_contact' => '09170002222',
            'ordered_quantity_value' => '1', 'unit_price' => '250.00', 'payment_terms' => 'Cash', 'fulfillment_arrangement' => 'pickup',
        ], 'so-create-2')->assertStatus(201);

        $page1 = $this->req('GET', "/api/v1/chapters/{$cid}/sales?limit=1")->assertOk()->assertJsonCount(1, 'orders');
        $cur = (string) $page1->json('next_cursor');
        $this->assertStringStartsWith('cur_', $cur);
        $this->req('GET', "/api/v1/chapters/{$cid}/sales?limit=1&cursor={$cur}")->assertOk()->assertJsonCount(1, 'orders')->assertJsonPath('next_cursor', null);

        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/submit", ['expected_row_version' => 1], 'so-sub-1')->assertOk();

        // GOV-05: officer holding SALES_REVIEWER cannot self-approve
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/approve", [
            'expected_row_version' => 2, 'expected_material_version' => 1, 'approve_price_override' => true,
        ], 'so-self-app')->assertStatus(403)->assertJsonPath('action_result', 'forbidden')->assertJsonPath('blocking_reason.code', 'SELF_APPROVAL_FORBIDDEN');

        // Independent reviewer checks discount guard without override -> 422 DISCOUNT_EXCEEDS_LIMIT, then approves with override
        $this->signInAs($f['rev_email'], $f['password'], $this->nextCode($f['rev_email'], $f['rev_codes']));
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/approve", [
            'expected_row_version' => 2, 'expected_material_version' => 1, 'approve_price_override' => false,
        ], 'so-disc-blk')->assertStatus(422)->assertJsonPath('blocking_reason.code', 'DISCOUNT_EXCEEDS_LIMIT');

        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/approve", [
            'expected_row_version' => 2, 'expected_material_version' => 1, 'approve_price_override' => true,
        ], 'so-app-ok')->assertOk()->assertJsonPath('data.order.status', 'approved');

        // Split 8 ordered against 6 free available -> 6 reserved available (Clock 1), 2 backorder shortage
        $split = $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/split", [
            'expected_row_version' => 3, 'occurred_at' => '2026-11-01T10:00:00Z',
        ], 'so-split-1');
        $split->assertOk()
            ->assertJsonPath('data.order.reserved_available_quantity', '6')
            ->assertJsonPath('data.order.backorder_shortage_quantity', '2')
            ->assertJsonPath('data.order.unpaid_available_state', 'active_unpaid');

        // Buyer accepts split & backorder -> Clock 2 starts
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/buyer-acceptance", [
            'decision' => 'accept_all', 'expected_row_version' => 4, 'occurred_at' => '2026-11-01T10:05:00Z',
        ], 'so-bacc-1')->assertOk()->assertJsonPath('data.order.accepted_backorder_quantity', '2')->assertJsonPath('data.order.backorder_state', 'awaiting_deposit');

        // Full-order billing SI is NOT proof of payment and confers zero release authority
        $si = $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/invoice", ['expected_row_version' => 5], 'so-si-1');
        $si->assertStatus(201)
            ->assertJsonPath('data.invoice.is_proof_of_payment', false)
            ->assertJsonPath('data.invoice.release_authority_granted', false)
            ->assertJsonPath('data.invoice.net_amount_due', '1850.00');
    }

    /** @return array<string, mixed> */
    private function seedChapterAndPool(): array
    {
        $sfx = strtolower(Str::random(8));
        $pw = 'TestPassword#2026!';
        $hash = password_hash($pw, PASSWORD_BCRYPT, ['cost' => 4]);
        $now = now()->format('Y-m-d H:i:s.u');

        $soU = $this->mkUser("so.{$sfx}@ysp.local", 'SalesOfficer', $hash, $now);
        $revU = $this->mkUser("rev.{$sfx}@ysp.local", 'Reviewer', $hash, $now);

        $orgId = DB::table('organizations')->insertGetId(['name' => "Org {$sfx}"]);
        $cid = DB::table('chapters')->insertGetId(['organization_id' => $orgId, 'code' => 'CEB', 'name' => 'Cebu', 'status' => 'live', 'row_version' => 1, 'provisioned_by_user_id' => $revU['id'], 'updated_at' => $now]);

        foreach ([[$soU['id'], ['SALES_OFFICER', 'SALES_REVIEWER']], [$revU['id'], ['SALES_REVIEWER', 'FINANCE', 'CHAPTER_HEAD']]] as [$uid, $roles]) {
            $mid = DB::table('memberships')->insertGetId(['chapter_id' => $cid, 'user_id' => $uid, 'status' => 'active', 'authority_version' => 1, 'authorized_by_user_id' => $revU['id'], 'authorized_at' => $now]);
            foreach ($roles as $rc) {
                $rid = (int) DB::table('roles')->where('code', $rc)->value('id');
                DB::table('duty_grants')->insert(['chapter_id' => $cid, 'membership_id' => $mid, 'role_id' => $rid, 'scope_kind' => 'chapter', 'starts_at' => now()->subMinute()->format('Y-m-d H:i:s.u')]);
            }
        }

        $uId = DB::table('units')->insertGetId(['chapter_id' => $cid, 'code' => 'PC', 'name' => 'Piece', 'quantity_scale' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        $iId = DB::table('items')->insertGetId(['chapter_id' => $cid, 'sku' => 'SHIRT-S', 'name' => 'YSP Tee', 'item_kind' => 'saleable', 'base_unit_id' => $uId, 'reorder_point' => '0.000000', 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        $vId = DB::table('item_variants')->insertGetId(['chapter_id' => $cid, 'item_id' => $iId, 'variant_code' => 'RED-S', 'name' => 'Red Small', 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('item_variant_guards')->insert(['chapter_id' => $cid, 'item_variant_id' => $vId, 'guard_version' => 1, 'updated_at' => $now]);
        $locId = DB::table('stock_locations')->insertGetId(['chapter_id' => $cid, 'code' => 'WH-1', 'name' => 'Main Warehouse', 'location_kind' => 'warehouse', 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        $condId = (int) DB::table('stock_conditions')->where('code', 'usable')->value('id');
        $lotId = DB::table('stock_lots')->insertGetId(['chapter_id' => $cid, 'item_variant_id' => $vId, 'source_kind' => 'opening', 'source_reference' => 'IPC-01', 'received_at' => $now, 'initial_quantity' => '6.000000', 'unit_scale' => 0, 'created_at' => $now]);
        DB::table('stock_positions')->insert(['chapter_id' => $cid, 'item_variant_id' => $vId, 'stock_location_id' => $locId, 'stock_condition_id' => $condId, 'stock_lot_id' => $lotId, 'unit_scale' => 0, 'on_hand_qty' => '6.000000', 'position_version' => 1, 'updated_at' => $now]);

        return ['chapter_id' => $cid, 'variant_id' => (string) $vId, 'password' => $pw,
            'so_email' => $soU['email'], 'so_codes' => $soU['codes'], 'rev_email' => $revU['email'], 'rev_codes' => $revU['codes']];
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
        $this->req('GET', '/csrf-cookie')->assertNoContent();
        $res = $this->req('POST', '/api/v1/session/sign-in', ['email' => $email, 'password' => $password])->assertOk();
        if ($res->json('state') === 'mfa_challenge_required' && $recoveryCode !== null) {
            $this->req('POST', '/api/v1/session/mfa/challenge/verify', ['challenge_id' => (string) $res->json('challenge.id'), 'method' => 'recovery_code', 'recovery_code' => $recoveryCode])->assertOk();
        }
    }

    /** @param  array<string, mixed>|null  $data
     * @return TestResponse<Response> */
    private function req(string $method, string $uri, ?array $data = null, ?string $idem = null): TestResponse
    {
        $h = ['Accept' => 'application/json', 'Origin' => (string) config('app.url')];
        $raw = null;
        if ($method !== 'GET') {
            $raw = json_encode(($data === null || $data === []) ? new stdClass : $data, JSON_THROW_ON_ERROR);
            $h['CONTENT_TYPE'] = 'application/json';
            $h['CONTENT_LENGTH'] = (string) strlen($raw);
            $h['X-XSRF-TOKEN'] = $this->cookieJar['XSRF-TOKEN'] ?? '';
            if ($idem !== null) {
                $h['Idempotency-Key'] = $idem;
            }
        }
        $r = $this->call($method, $uri, [], $this->cookieJar, [], $this->transformHeadersToServerVars($h), $raw);
        foreach ($r->headers->getCookies() as $c) {
            if ($c->isCleared() || (string) $c->getValue() === '') {
                unset($this->cookieJar[$c->getName()]);
            } else {
                $this->cookieJar[$c->getName()] = (string) $c->getValue();
            }
        }

        return $r;
    }
}
