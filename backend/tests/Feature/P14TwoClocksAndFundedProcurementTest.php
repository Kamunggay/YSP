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

final class P14TwoClocksAndFundedProcurementTest extends TestCase
{
    /** @var array<string, string> */
    private array $cookieJar = [];

    /** @var array<string, int> */
    private array $codeCursor = [];

    public function test_independent_48h_clocks_repf_gating_and_late_payment_resolution(): void
    {
        $f = $this->seedFixture();
        $cid = $f['chapter_id'];

        $this->signInAs($f['so_email'], $f['password'], $this->nextCode($f['so_email'], $f['so_codes']));
        $soId = (string) $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders", [
            'variant_id' => $f['variant_id'], 'buyer_name' => 'Chapter Member Buyer', 'buyer_contact' => 'buyer@example.local',
            'ordered_quantity_value' => '8', 'unit_price' => '150.00', 'estimated_procurement_cost' => '200.00',
            'payment_terms' => 'Deposit 200 within 48h', 'fulfillment_arrangement' => 'pickup',
        ], 'c-14')->assertStatus(201)->json('data.order.so_id');
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/submit", ['expected_row_version' => 1], 's-14')->assertOk();

        $this->signInAs($f['fin_email'], $f['password'], $this->nextCode($f['fin_email'], $f['fin_codes']));
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/approve", ['expected_row_version' => 2, 'expected_material_version' => 1], 'a-14')->assertOk();

        // T0: Split -> 6 available (Clock 1 expires T0 + 48h), 2 shortage
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/split", ['expected_row_version' => 3, 'occurred_at' => '2026-11-01T10:00:00Z'], 'sp-14')->assertOk();

        // T0 + 24h: Buyer accepts split & backorder -> Clock 2 expires T0 + 72h (2026-11-04T10:00:00Z)
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/buyer-acceptance", [
            'decision' => 'accept_all', 'expected_row_version' => 4, 'occurred_at' => '2026-11-02T10:00:00Z',
        ], 'ba-14')->assertOk();

        // Unfunded RepF forward is blocked -> 409 SHORTAGE_NOT_FUNDED
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/forward-repf", ['expected_row_version' => 5], 'repf-blk')->assertStatus(409)->assertJsonPath('blocking_reason.code', 'SHORTAGE_NOT_FUNDED');

        // Backorder deposit funded at T0 + 30h -> unfunded shortage becomes funded_protected, then Clock 1 expires at T0 + 50h releasing ONLY unpaid 6!
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/funding", [
            'funding_scope' => 'backorder_deposit', 'or_reference' => 'OR-DEP-100', 'amount' => '200.00',
            'expected_row_version' => 5, 'verified_at' => '2026-11-02T16:00:00Z',
        ], 'fund-bo')->assertOk()->assertJsonPath('data.order.backorder_state', 'funded_protected');

        $eval = $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/evaluate-clocks", [
            'as_of' => '2026-11-03T12:00:00Z', 'expected_row_version' => 6,
        ], 'eval-50h')->assertOk();
        $eval->assertJsonPath('data.order.unpaid_available_state', 'expired_released')->assertJsonPath('data.order.backorder_state', 'funded_protected');

        // Forwarding funded shortage requires Finance cost approval
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/forward-repf", ['expected_row_version' => 7], 'repf-no-cost')
            ->assertStatus(409)->assertJsonPath('blocking_reason.code', 'FINANCE_COST_APPROVAL_REQUIRED');

        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/approve-excess-cost", ['expected_row_version' => 7, 'estimated_procurement_cost' => '200.00'], 'cost-ok')->assertOk();
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/forward-repf", ['expected_row_version' => 8], 'repf-ok')
            ->assertStatus(201)->assertJsonPath('data.repf.funded_or_reference', 'OR-DEP-100');

        // Claim the released 6 units via a competing SO so late payment encounters zero free stock -> routes cleanly
        $this->signInAs($f['so_email'], $f['password'], $this->nextCode($f['so_email'], $f['so_codes']));
        $so2 = (string) $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders", [
            'variant_id' => $f['variant_id'], 'buyer_name' => 'Faster Buyer', 'buyer_contact' => 'fast@example.local',
            'ordered_quantity_value' => '6', 'unit_price' => '150.00', 'payment_terms' => 'Immediate', 'fulfillment_arrangement' => 'pickup',
        ], 'c2-14')->assertStatus(201)->json('data.order.so_id');
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$so2}/submit", ['expected_row_version' => 1], 's2-14')->assertOk();
        $this->signInAs($f['fin_email'], $f['password'], $this->nextCode($f['fin_email'], $f['fin_codes']));
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$so2}/approve", ['expected_row_version' => 2, 'expected_material_version' => 1], 'a2-14')->assertOk();
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$so2}/split", ['expected_row_version' => 3], 'sp2-14')->assertOk()->assertJsonPath('data.order.reserved_available_quantity', '6');

        // Late payment on original SO finds 0 free stock -> routes to Finance refund without over-allocating
        $this->req('POST', "/api/v1/chapters/{$cid}/sales/orders/{$soId}/resolve-late-payment", [
            'or_reference' => 'OR-LATE-99', 'requested_quantity_value' => '6', 'fallback_choice' => 'route_to_finance_refund', 'expected_row_version' => 9,
        ], 'late-pay')->assertOk()->assertJsonPath('data.resolution.outcome', 'route_to_finance_refund')->assertJsonPath('data.resolution.available_at_check', '0');
    }

    /** @return array<string, mixed> */
    private function seedFixture(): array
    {
        $sfx = strtolower(Str::random(8));
        $pw = 'TestPassword#2026!';
        $hash = password_hash($pw, PASSWORD_BCRYPT, ['cost' => 4]);
        $now = now()->format('Y-m-d H:i:s.u');

        $soU = $this->mkUser("so14.{$sfx}@ysp.local", 'Sales', $hash, $now);
        $finU = $this->mkUser("fin14.{$sfx}@ysp.local", 'FinanceHead', $hash, $now);

        $orgId = DB::table('organizations')->insertGetId(['name' => "Org {$sfx}"]);
        $cid = DB::table('chapters')->insertGetId(['organization_id' => $orgId, 'code' => 'CEB', 'name' => 'Cebu', 'status' => 'live', 'row_version' => 1, 'provisioned_by_user_id' => $finU['id'], 'updated_at' => $now]);

        foreach ([[$soU['id'], ['SALES_OFFICER', 'CHAPTER_HEAD']], [$finU['id'], ['FINANCE', 'SALES_REVIEWER', 'CHAPTER_HEAD']]] as [$uid, $roles]) {
            $mid = DB::table('memberships')->insertGetId(['chapter_id' => $cid, 'user_id' => $uid, 'status' => 'active', 'authority_version' => 1, 'authorized_by_user_id' => $finU['id'], 'authorized_at' => $now]);
            foreach ($roles as $rc) {
                $rid = (int) DB::table('roles')->where('code', $rc)->value('id');
                DB::table('duty_grants')->insert(['chapter_id' => $cid, 'membership_id' => $mid, 'role_id' => $rid, 'scope_kind' => 'chapter', 'starts_at' => now()->subMinute()->format('Y-m-d H:i:s.u')]);
            }
        }

        $uId = DB::table('units')->insertGetId(['chapter_id' => $cid, 'code' => 'PC', 'name' => 'Piece', 'quantity_scale' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        $iId = DB::table('items')->insertGetId(['chapter_id' => $cid, 'sku' => 'CAP-01', 'name' => 'YSP Cap', 'item_kind' => 'saleable', 'base_unit_id' => $uId, 'reorder_point' => '0.000000', 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        $vId = DB::table('item_variants')->insertGetId(['chapter_id' => $cid, 'item_id' => $iId, 'variant_code' => 'BLK', 'name' => 'Black Cap', 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('item_variant_guards')->insert(['chapter_id' => $cid, 'item_variant_id' => $vId, 'guard_version' => 1, 'updated_at' => $now]);
        $locId = DB::table('stock_locations')->insertGetId(['chapter_id' => $cid, 'code' => 'WH-1', 'name' => 'Main Warehouse', 'location_kind' => 'warehouse', 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        $condId = (int) DB::table('stock_conditions')->where('code', 'usable')->value('id');
        $lotId = DB::table('stock_lots')->insertGetId(['chapter_id' => $cid, 'item_variant_id' => $vId, 'source_kind' => 'opening', 'source_reference' => 'IPC-01', 'received_at' => $now, 'initial_quantity' => '6.000000', 'unit_scale' => 0, 'created_at' => $now]);
        DB::table('stock_positions')->insert(['chapter_id' => $cid, 'item_variant_id' => $vId, 'stock_location_id' => $locId, 'stock_condition_id' => $condId, 'stock_lot_id' => $lotId, 'unit_scale' => 0, 'on_hand_qty' => '6.000000', 'position_version' => 1, 'updated_at' => $now]);

        return ['chapter_id' => $cid, 'variant_id' => (string) $vId, 'password' => $pw,
            'so_email' => $soU['email'], 'so_codes' => $soU['codes'], 'fin_email' => $finU['email'], 'fin_codes' => $finU['codes']];
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
