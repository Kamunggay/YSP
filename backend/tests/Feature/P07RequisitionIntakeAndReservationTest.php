<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\InventoryCustody\InventoryFingerprint;
use App\Modules\InventoryCustody\InventoryLedgerParticipant;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use stdClass;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

final class P07RequisitionIntakeAndReservationTest extends TestCase
{
    /** @var array<string, string> */
    private array $cookieJar = [];

    /** @var array<string, int> */
    private array $codeCursor = [];

    public function test_rf_lifecycle_gov05_no_self_approval_and_revision_invalidates_approval(): void
    {
        $f = $this->seedChapterAndStock();
        $cid = $f['chapter_id'];

        $this->signInAs($f['req_email'], $f['password'], $this->nextCode($f['req_email'], $f['req_codes']));
        $this->req('GET', "/api/v1/chapters/{$cid}/requisitions/form-options")->assertOk()->assertJsonCount(1, 'authorized_requesting_units');

        $create = $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/drafts", [
            'requesting_unit_id' => $f['unit_id'],
            'lines' => [['variant_id' => $f['variant_id'], 'requested_quantity_value' => '10']],
        ], 'rf-create-1');
        $create->assertStatus(201)->assertJsonPath('schema_version', '1.0')->assertJsonPath('action_result', 'success')->assertJsonPath('data.requisition.status', 'draft');
        $rfId = (string) $create->json('data.requisition.rf_id');

        // Body expected_version is rejected per transport v1
        $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfId}/submit", [
            'expected_version' => 1,
        ], 'rf-sub-bad')->assertStatus(422)->assertJsonPath('blocking_reason.code', 'UNSUPPORTED_FIELD');

        $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfId}/submit", [
            'expected_row_version' => 1, 'expected_material_version' => 1,
        ], 'rf-submit-1')->assertOk()->assertJsonPath('data.requisition.status', 'submitted');

        // Submitted RF cannot be discarded via DELETE /draft -> 409 RF_NOT_DRAFT
        $this->req('DELETE', "/api/v1/chapters/{$cid}/requisitions/{$rfId}/draft", [
            'expected_row_version' => 2,
        ], 'rf-discard-bad')->assertStatus(409)->assertJsonPath('blocking_reason.code', 'RF_NOT_DRAFT');

        // Requester holding RF_APPROVER cannot self-approve (GOV-05)
        $this->signInAs($f['req_email'], $f['password'], $this->nextCode($f['req_email'], $f['req_codes']));
        $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfId}/review", [
            'decision' => 'approve', 'expected_row_version' => 2, 'expected_material_version' => 1,
        ], 'rf-self-app')->assertStatus(403)->assertJsonPath('action_result', 'forbidden')->assertJsonPath('blocking_reason.code', 'SELF_APPROVAL_FORBIDDEN');

        // Independent approver returns, requester revises, resubmits, then approver approves
        $this->signInAs($f['app_email'], $f['password'], $this->nextCode($f['app_email'], $f['app_codes']));
        $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfId}/review", [
            'decision' => 'return', 'reason' => 'Adjust count before approval', 'expected_row_version' => 2, 'expected_material_version' => 1,
        ], 'rf-ret-1')->assertOk()->assertJsonPath('data.requisition.status', 'returned');

        $this->signInAs($f['req_email'], $f['password'], $this->nextCode($f['req_email'], $f['req_codes']));
        $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfId}/revise", [
            'reason' => 'Confirm 10 units', 'expected_row_version' => 3, 'expected_material_version' => 1, 'expected_progress_version' => 1,
            'lines' => [['variant_id' => $f['variant_id'], 'requested_quantity_value' => '10']],
        ], 'rf-rev-1')->assertOk()->assertJsonPath('data.requisition.status', 'draft')->assertJsonPath('data.requisition.material_version', 2);

        $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfId}/submit", [
            'expected_row_version' => 4, 'expected_material_version' => 2,
        ], 'rf-sub-2')->assertOk();

        $this->signInAs($f['app_email'], $f['password'], $this->nextCode($f['app_email'], $f['app_codes']));
        $app = $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfId}/review", [
            'decision' => 'approve', 'expected_row_version' => 5, 'expected_material_version' => 2,
        ], 'rf-app-1');
        $app->assertOk()->assertJsonPath('data.requisition.status', 'approved')->assertJsonPath('data.requisition.approval.approved_material_version', 2);

        // AC-14: material revision on approved RF invalidates old approval & resets material_version=3
        $this->signInAs($f['req_email'], $f['password'], $this->nextCode($f['req_email'], $f['req_codes']));
        $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfId}/revise", [
            'reason' => 'Need 6 instead of 10', 'expected_row_version' => 6, 'expected_material_version' => 2, 'expected_progress_version' => 1,
            'lines' => [['variant_id' => $f['variant_id'], 'requested_quantity_value' => '6']],
        ], 'rf-rev-2')->assertOk()->assertJsonPath('data.requisition.status', 'draft')->assertJsonPath('data.requisition.approval', null);

        // Discard draft cleanly marks draft canceled without deleting immutable event history
        $this->req('DELETE', "/api/v1/chapters/{$cid}/requisitions/{$rfId}/draft", [
            'expected_row_version' => 7,
        ], 'rf-discard-ok')->assertOk()->assertJsonPath('data.discarded', true)->assertJsonPath('data.requisition.status', 'canceled');
    }

    public function test_two_step_reservation_competition_hold_overlap_cursor_and_release(): void
    {
        $f = $this->seedChapterAndStock('10');
        $cid = $f['chapter_id'];

        $rfA = $this->createApprovedRf($f, '8', 'rfa');
        $rfB = $this->createApprovedRf($f, '5', 'rfb');

        // Cursor pagination across the 2 requisitions
        $page1 = $this->req('GET', "/api/v1/chapters/{$cid}/requisitions?limit=1")->assertOk()->assertJsonCount(1, 'requisitions');
        $nextCursor = (string) $page1->json('next_cursor');
        $this->assertStringStartsWith('cur_', $nextCursor);
        $this->req('GET', "/api/v1/chapters/{$cid}/requisitions?limit=1&cursor={$nextCursor}")->assertOk()->assertJsonCount(1, 'requisitions')->assertJsonPath('next_cursor', null);

        // Sign in as INVENTORY to prepare & allocate [0, 6) for RF A
        $this->signInAs($f['inv_email'], $f['password']);
        $prepA = $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfA['rf_id']}/reservations/prepare", [
            'rf_line_id' => $rfA['line_id'], 'stock_position_id' => $f['pos_id'], 'offset_value' => '0', 'quantity_value' => '6',
        ], 'prep-a')->assertStatus(201);
        $prepAId = (string) $prepA->json('data.preparation.preparation_id');

        // Prepare competing [4, 9) for RF B BEFORE committing A (AC-01 last-unit competition)
        $prepB = $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfB['rf_id']}/reservations/prepare", [
            'rf_line_id' => $rfB['line_id'], 'stock_position_id' => $f['pos_id'], 'offset_value' => '4', 'quantity_value' => '5',
        ], 'prep-b')->assertStatus(201);
        $prepBId = (string) $prepB->json('data.preparation.preparation_id');

        $commitA = $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfA['rf_id']}/allocate", [
            'preparation_id' => $prepAId, 'expected_row_version' => 3,
        ], 'commit-a');
        $commitA->assertStatus(201)->assertJsonPath('data.reservation.expires_at', null)->assertJsonPath('data.reservation.active_quantity', '6');
        $resAId = (string) $commitA->json('data.reservation.reservation_id');

        // Competing commit B sees bumped stock position version -> 409 stale STALE_STOCK_VERSION
        $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfB['rf_id']}/allocate", [
            'preparation_id' => $prepBId, 'expected_row_version' => 3,
        ], 'commit-b')->assertStatus(409)->assertJsonPath('action_result', 'stale')->assertJsonPath('blocking_reason.code', 'STALE_STOCK_VERSION');

        // Internal hold over [4, 7) via InventoryLedgerParticipant creates hold=3, overlap with [0, 6) = 2 -> blocked_quantity = 2
        $invActor = ['user_id' => (int) DB::table('users')->where('email', $f['inv_email'])->value('id'), 'membership_id' => null, 'duty_grant_id' => null, 'authority_version' => 1];
        $holdRes = app(InventoryLedgerParticipant::class)->recordStockHold($cid, $invActor, 'hold-overlap', [
            'item_variant_id' => $f['variant_id'], 'stock_position_id' => $f['pos_id'],
            'hold_kind' => 'inspection', 'reason' => 'QA check',
            'quantity' => ['value' => '3', 'quantity_scale' => 0], 'coverage_start_qty' => '4',
        ]);
        $this->assertSame(201, $holdRes['http_status']);

        $snap = $this->req('GET', "/api/v1/chapters/{$cid}/requisitions");
        $snap->assertOk()
            ->assertJsonPath('summary.usable_on_hand', '10')
            ->assertJsonPath('summary.rf_reserved', '6')
            ->assertJsonPath('reservations.0.blocked_quantity', '2')
            ->assertJsonPath('reservations.0.status', 'partially_blocked');

        // Release RF A [0, 6), freeing availability
        $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfA['rf_id']}/reservations/{$resAId}/release", [
            'reason' => 'Free reservation', 'expected_row_version' => 1, 'expected_rf_version' => 4, 'expected_progress_version' => 2,
        ], 'rel-a')->assertOk()->assertJsonPath('data.reservation.status', 'released');

        // Sign in as requester (COMMITTEE_REQUESTER) to cancel RF B
        $this->signInAs($f['req_email'], $f['password'], $this->nextCode($f['req_email'], $f['req_codes']));
        $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfB['rf_id']}/cancel", [
            'reason' => 'No longer needed', 'expected_row_version' => 3, 'expected_material_version' => 1, 'expected_progress_version' => 1,
        ], 'can-b')->assertOk()->assertJsonPath('data.requisition.status', 'canceled');
    }

    /** @return array{rf_id: string, line_id: string} */
    private function createApprovedRf(array $f, string $qty, string $tag): array
    {
        $cid = $f['chapter_id'];
        $this->signInAs($f['req_email'], $f['password'], $this->nextCode($f['req_email'], $f['req_codes']));
        $c = $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/drafts", [
            'requesting_unit_id' => $f['unit_id'],
            'lines' => [['variant_id' => $f['variant_id'], 'requested_quantity_value' => $qty]],
        ], "c-{$tag}")->assertStatus(201);
        $rfId = (string) $c->json('data.requisition.rf_id');
        $lineId = (string) $c->json('data.requisition.lines.0.line_id');
        $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfId}/submit", ['expected_row_version' => 1, 'expected_material_version' => 1], "s-{$tag}")->assertOk();
        $this->signInAs($f['app_email'], $f['password'], $this->nextCode($f['app_email'], $f['app_codes']));
        $this->req('POST', "/api/v1/chapters/{$cid}/requisitions/{$rfId}/review", ['decision' => 'approve', 'expected_row_version' => 2, 'expected_material_version' => 1], "a-{$tag}")->assertOk();

        return ['rf_id' => $rfId, 'line_id' => $lineId];
    }

    /** @param list<string> $codes */
    private function nextCode(string $email, array $codes): string
    {
        $idx = $this->codeCursor[$email] ?? 0;
        $this->codeCursor[$email] = $idx + 1;

        return $codes[$idx];
    }

    /** @return array<string, mixed> */
    private function seedChapterAndStock(string $qty = '10'): array
    {
        $sfx = strtolower(Str::random(8));
        $pw = 'TestPassword#2026!';
        $hash = password_hash($pw, PASSWORD_BCRYPT, ['cost' => 4]);
        $now = now()->format('Y-m-d H:i:s.u');

        $reqU = $this->mkUser("req.{$sfx}@ysp.local", 'Requester', $hash, $now);
        $appU = $this->mkUser("app.{$sfx}@ysp.local", 'Approver', $hash, $now);
        $invU = $this->mkUser("inv.{$sfx}@ysp.local", 'Inventory', $hash, $now);

        $orgId = DB::table('organizations')->insertGetId(['name' => "Org {$sfx}"]);
        $cid = DB::table('chapters')->insertGetId(['organization_id' => $orgId, 'code' => 'CEB', 'name' => 'Cebu', 'status' => 'live', 'row_version' => 1, 'provisioned_by_user_id' => $appU['id'], 'updated_at' => $now]);
        $unitId = DB::table('requesting_units')->insertGetId(['chapter_id' => $cid, 'code' => 'MEM', 'name' => 'Membership', 'active' => true]);

        foreach ([[$reqU['id'], ['COMMITTEE_REQUESTER', 'RF_APPROVER']], [$appU['id'], ['RF_APPROVER', 'CHAPTER_HEAD']], [$invU['id'], ['INVENTORY']]] as [$uid, $roles]) {
            $mid = DB::table('memberships')->insertGetId(['chapter_id' => $cid, 'user_id' => $uid, 'status' => 'active', 'authority_version' => 1, 'authorized_by_user_id' => $appU['id'], 'authorized_at' => $now]);
            foreach ($roles as $rc) {
                $rid = (int) DB::table('roles')->where('code', $rc)->value('id');
                DB::table('duty_grants')->insert(['chapter_id' => $cid, 'membership_id' => $mid, 'role_id' => $rid, 'scope_kind' => 'chapter', 'starts_at' => now()->subMinute()->format('Y-m-d H:i:s.u')]);
            }
        }

        $uId = DB::table('units')->insertGetId(['chapter_id' => $cid, 'code' => 'PC', 'name' => 'Piece', 'quantity_scale' => 0, 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        $iId = DB::table('items')->insertGetId(['chapter_id' => $cid, 'sku' => 'POLO-M', 'name' => 'YSP Polo M', 'item_kind' => 'consumable', 'base_unit_id' => $uId, 'reorder_point' => '5.000000', 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        $vId = DB::table('item_variants')->insertGetId(['chapter_id' => $cid, 'item_id' => $iId, 'variant_code' => 'NVY-M', 'name' => 'Navy Medium', 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('item_variant_guards')->insert(['chapter_id' => $cid, 'item_variant_id' => $vId, 'guard_version' => 1, 'updated_at' => $now]);
        DB::table('item_policy_versions')->insert(['chapter_id' => $cid, 'item_id' => $iId, 'version_number' => 1, 'status' => 'approved', 'is_eligibility_approved' => true, 'requires_condition_check' => true, 'settings_json' => '{}', 'settings_hash' => hash('sha256', '{}', true), 'authored_by_user_id' => $invU['id'], 'approved_by_user_id' => $appU['id'], 'approved_at' => $now, 'created_at' => $now, 'updated_at' => $now]);
        $locId = DB::table('stock_locations')->insertGetId(['chapter_id' => $cid, 'code' => 'WH-1', 'name' => 'Main Warehouse', 'location_kind' => 'warehouse', 'active' => true, 'created_at' => $now, 'updated_at' => $now]);
        $condId = (int) DB::table('stock_conditions')->where('code', 'usable')->value('id');
        $lotId = DB::table('stock_lots')->insertGetId(['chapter_id' => $cid, 'item_variant_id' => $vId, 'source_kind' => 'opening', 'source_reference' => 'IPC-01', 'received_at' => $now, 'initial_quantity' => $qty, 'unit_scale' => 0, 'created_at' => $now]);
        $posId = DB::table('stock_positions')->insertGetId(['chapter_id' => $cid, 'item_variant_id' => $vId, 'stock_location_id' => $locId, 'stock_condition_id' => $condId, 'stock_lot_id' => $lotId, 'unit_scale' => 0, 'on_hand_qty' => $qty, 'position_version' => 1, 'updated_at' => $now]);

        return ['chapter_id' => $cid, 'unit_id' => (string) $unitId, 'variant_id' => (string) $vId, 'pos_id' => (string) $posId, 'password' => $pw,
            'req_email' => $reqU['email'], 'req_codes' => $reqU['codes'], 'app_email' => $appU['email'], 'app_codes' => $appU['codes'], 'inv_email' => $invU['email']];
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
