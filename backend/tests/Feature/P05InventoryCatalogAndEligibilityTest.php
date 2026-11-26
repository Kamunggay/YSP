<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Modules\InventoryCustody\InventoryFingerprint;
use App\Modules\InventoryCustody\InventoryLedgerParticipant;
use App\Modules\InventoryCustody\StockHoldOperations;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use stdClass;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

final class P05InventoryCatalogAndEligibilityTest extends TestCase
{
    /** @var array<string, string> */
    private array $cookieJar = [];

    public function test_catalog_policy_gate_unit_freeze_and_gov05_dual_control(): void
    {
        $fixture = $this->createChapterFixture();
        $chapterId = $fixture['chapter_id'];

        $this->signInAs($fixture['inventory_email'], $fixture['password']);

        // Create unit (scale=0), attempt invalid fractional ROP item, then valid integer ROP item + variant + location
        $unitRes = $this->invPost("/api/v1/chapters/{$chapterId}/inventory/units", [
            'code' => 'PCS',
            'name' => 'Pieces',
            'quantity_scale' => 0,
        ]);
        $unitRes->assertStatus(201)->assertJsonPath('schema_version', '1.0')->assertJsonPath('action_result', 'success');
        $unitId = (string) $unitRes->json('data.unit.id');

        $this->invPost("/api/v1/chapters/{$chapterId}/inventory/items", [
            'sku' => 'KIT-BAD',
            'name' => 'Bad Fraction Kit',
            'item_kind' => 'kit',
            'base_unit_id' => $unitId,
            'reorder_point' => '2.5',
        ])->assertStatus(422)->assertJsonPath('action_result', 'blocked')->assertJsonPath('blocking_reason.code', 'INVALID_UNIT_PRECISION');

        $itemRes = $this->invPost("/api/v1/chapters/{$chapterId}/inventory/items", [
            'sku' => 'KIT-001',
            'name' => 'Emergency Relief Kit',
            'item_kind' => 'kit',
            'base_unit_id' => $unitId,
            'reorder_point' => '10',
        ]);
        $itemRes->assertStatus(201);
        $itemId = (string) $itemRes->json('data.item.id');

        // Body expected_version is rejected with 422 UNSUPPORTED_FIELD; expected_row_version is enforced cleanly
        $this->invPatch("/api/v1/chapters/{$chapterId}/inventory/units/{$unitId}", [
            'expected_version' => 1,
            'quantity_scale' => 2,
        ])->assertStatus(422)->assertJsonPath('blocking_reason.code', 'UNSUPPORTED_FIELD')->assertJsonPath('field_feedback.0.path', '/expected_version');

        // Unit quantity_scale is now frozen once referenced by an item
        $this->invPatch("/api/v1/chapters/{$chapterId}/inventory/units/{$unitId}", [
            'expected_row_version' => 1,
            'quantity_scale' => 2,
        ])->assertStatus(409)->assertJsonPath('blocking_reason.code', 'UNIT_SCALE_FROZEN');

        $variantRes = $this->invPost("/api/v1/chapters/{$chapterId}/inventory/items/{$itemId}/variants", [
            'variant_code' => 'STD',
            'name' => 'Standard Relief Pack',
        ]);
        $variantRes->assertStatus(201);
        $variantId = (string) $variantRes->json('data.variant.id');

        $locRes = $this->invPost("/api/v1/chapters/{$chapterId}/inventory/locations", [
            'code' => 'WH-MAIN',
            'name' => 'Main Warehouse',
            'location_kind' => 'warehouse',
        ]);
        $locRes->assertStatus(201);

        // Zero-stock baseline: unapproved policy gate blocks eligibility even for qty=0, reports exact views and ROP shortage
        $zeroElig = $this->invGet("/api/v1/chapters/{$chapterId}/inventory/variants/{$variantId}/eligibility?requested_qty=0");
        $zeroElig->assertOk()
            ->assertJsonPath('policy_gate.approved', false)
            ->assertJsonPath('eligible', false)
            ->assertJsonPath('views.on_hand.value', '0')
            ->assertJsonPath('views.available.value', '0')
            ->assertJsonPath('reorder.below_reorder_point', true)
            ->assertJsonPath('reorder.reorder_shortage.value', '10');

        // Draft item policy
        $draftRes = $this->invPost("/api/v1/chapters/{$chapterId}/inventory/items/{$itemId}/policy-drafts", [
            'is_eligibility_approved' => true,
            'requires_condition_check' => true,
            'max_hold_hours' => 72,
        ]);
        $draftRes->assertStatus(201);
        $policyVersionId = (string) $draftRes->json('data.item_policy_version.id');

        // Granting CHAPTER_HEAD requires MFA step-up before approval is reachable
        $this->grantRole($chapterId, $fixture['inventory_membership_id'], 'CHAPTER_HEAD');
        $this->invPost("/api/v1/chapters/{$chapterId}/inventory/item-policy-versions/{$policyVersionId}/approve", [])
            ->assertStatus(403)
            ->assertJsonPath('action_result', 'forbidden')
            ->assertJsonPath('chapter_id', null)
            ->assertJsonPath('blocking_reason.code', 'MFA_REQUIRED');

        // GOV-05: even after MFA verification, author cannot approve their own policy draft
        $this->signInAs($fixture['inventory_email'], $fixture['password'], $fixture['inventory_codes'][0]);
        $this->invPost("/api/v1/chapters/{$chapterId}/inventory/item-policy-versions/{$policyVersionId}/approve", [])
            ->assertStatus(403)
            ->assertJsonPath('action_result', 'forbidden')
            ->assertJsonPath('blocking_reason.code', 'SELF_APPROVAL_FORBIDDEN');

        // Distinct approver (CHAPTER_HEAD with MFA) approves policy
        $this->signInAs($fixture['approver_email'], $fixture['password'], $fixture['approver_codes'][0]);
        $this->invPost("/api/v1/chapters/{$chapterId}/inventory/item-policy-versions/{$policyVersionId}/approve", [])
            ->assertOk()
            ->assertJsonPath('data.item_policy_version.status', 'approved');

        // Invalid Idempotency-Key (whitespace) is rejected with 422 INVALID_IDEMPOTENCY_KEY
        $this->invPost("/api/v1/chapters/{$chapterId}/inventory/units", [
            'code' => 'BOX',
            'name' => 'Box',
            'quantity_scale' => 0,
        ], ['Idempotency-Key' => ' bad key '])->assertStatus(422)->assertJsonPath('blocking_reason.code', 'INVALID_IDEMPOTENCY_KEY');

        $approvedElig = $this->invGet("/api/v1/chapters/{$chapterId}/inventory/variants/{$variantId}/eligibility?requested_qty=0");
        $approvedElig->assertOk()
            ->assertJsonPath('policy_gate.approved', true)
            ->assertJsonPath('eligible', true);
    }

    public function test_gov03_provider_isolation_and_cross_chapter_redaction(): void
    {
        $fixtureA = $this->createChapterFixture();
        $fixtureB = $this->createChapterFixture();
        $chapterA = $fixtureA['chapter_id'];

        $this->signInAs($fixtureA['inventory_email'], $fixtureA['password']);
        $unitId = (string) $this->invPost("/api/v1/chapters/{$chapterA}/inventory/units", [
            'code' => 'BOX',
            'name' => 'Box',
            'quantity_scale' => 0,
        ])->json('data.unit.id');
        $itemId = (string) $this->invPost("/api/v1/chapters/{$chapterA}/inventory/items", [
            'sku' => 'BOX-01',
            'name' => 'Food Box',
            'item_kind' => 'consumable',
            'base_unit_id' => $unitId,
        ])->json('data.item.id');
        $variantId = (string) $this->invPost("/api/v1/chapters/{$chapterA}/inventory/items/{$itemId}/variants", [
            'variant_code' => 'REG',
            'name' => 'Regular',
        ])->json('data.variant.id');

        // Stock holds are strictly internal application operations (no public /inventory/holds route)
        $this->invPost("/api/v1/chapters/{$chapterA}/inventory/holds", ['reason' => 'not exposed'])->assertStatus(404);

        // Provider admin without chapter A membership must receive redacted 403 ForbiddenResult
        $this->signInAs($fixtureA['provider_email'], $fixtureA['password'], $fixtureA['provider_codes'][0]);
        $this->invGet("/api/v1/chapters/{$chapterA}/inventory/catalog")->assertStatus(403)->assertJsonPath('action_result', 'forbidden');
        $this->invGet("/api/v1/chapters/{$chapterA}/inventory/variants/{$variantId}/eligibility")->assertStatus(403);

        // Chapter B officer querying/mutating Chapter A must receive redacted 403 (chapter_id: null)
        $this->signInAs($fixtureB['inventory_email'], $fixtureB['password']);
        $this->invGet("/api/v1/chapters/{$chapterA}/inventory/variants/{$variantId}/eligibility")->assertStatus(403)->assertJsonPath('chapter_id', null);
        $this->invPost("/api/v1/chapters/{$chapterA}/inventory/locations", [
            'code' => 'X',
            'name' => 'Cross Chapter',
        ])->assertStatus(403);
    }

    public function test_disjoint_interval_holds_overlap_union_idempotency_and_terminal_clearance(): void
    {
        $fixture = $this->createChapterFixture();
        $chapterId = $fixture['chapter_id'];

        $this->signInAs($fixture['inventory_email'], $fixture['password']);
        $unitId = (string) $this->invPost("/api/v1/chapters/{$chapterId}/inventory/units", [
            'code' => 'KG',
            'name' => 'Kilograms',
            'quantity_scale' => 3,
        ])->json('data.unit.id');
        $itemId = (string) $this->invPost("/api/v1/chapters/{$chapterId}/inventory/items", [
            'sku' => 'RICE-01',
            'name' => 'Fortified Rice',
            'item_kind' => 'consumable',
            'base_unit_id' => $unitId,
            'reorder_point' => '5.000',
        ])->json('data.item.id');
        $variantId = (string) $this->invPost("/api/v1/chapters/{$chapterId}/inventory/items/{$itemId}/variants", [
            'variant_code' => '25KG',
            'name' => 'Rice Sack Lot',
        ])->json('data.variant.id');
        $locationId = (string) $this->invPost("/api/v1/chapters/{$chapterId}/inventory/locations", [
            'code' => 'WH-RICE',
            'name' => 'Dry Goods Bay',
            'location_kind' => 'warehouse',
        ])->json('data.location.id');

        $draftId = (string) $this->invPost("/api/v1/chapters/{$chapterId}/inventory/items/{$itemId}/policy-drafts", [
            'is_eligibility_approved' => true,
        ])->json('data.item_policy_version.id');
        $this->signInAs($fixture['approver_email'], $fixture['password'], $fixture['approver_codes'][0]);
        $this->invPost("/api/v1/chapters/{$chapterId}/inventory/item-policy-versions/{$draftId}/approve", [])->assertOk();

        // Seed 10.000 usable stock position directly in test fixture (no HTTP balance-setter exists)
        $positionId = $this->seedPositiveStockPosition($chapterId, (int) $variantId, (int) $locationId, 'usable', '10.000', 3);

        $this->signInAs($fixture['inventory_email'], $fixture['password']);
        $before = $this->invGet("/api/v1/chapters/{$chapterId}/inventory/variants/{$variantId}/eligibility?requested_qty=4.5");
        $before->assertOk()
            ->assertJsonPath('eligible', true)
            ->assertJsonPath('views.on_hand.value', '10')
            ->assertJsonPath('views.available.value', '10');
        $pinPosVer = (int) $before->json("guard_pin.position_versions.{$positionId}");
        $pinGuardVer = (int) $before->json('guard_pin.variant_guard_version');

        /** @var InventoryLedgerParticipant $participant */
        $participant = app(InventoryLedgerParticipant::class);
        $actor = ['user_id' => (int) DB::table('users')->where('email', $fixture['inventory_email'])->value('id'), 'membership_id' => $fixture['inventory_membership_id'], 'duty_grant_id' => null, 'authority_version' => 1];

        // Internal Hold H1 on [0, 3) with exact GuardPin and Idempotency-Key
        $h1Payload = [
            'item_variant_id' => $variantId,
            'stock_position_id' => (string) $positionId,
            'hold_kind' => 'inspection',
            'reason' => 'Sample quality moisture inspection',
            'quantity' => ['value' => '3', 'quantity_scale' => 3],
            'coverage_start_qty' => '0',
            'expected_position_version' => $pinPosVer,
            'expected_variant_guard_version' => $pinGuardVer,
        ];
        $h1Res = $participant->recordStockHold($chapterId, $actor, 'hold-h1', $h1Payload);
        $this->assertSame(201, $h1Res['http_status']);
        $this->assertSame('1.0', $h1Res['body']['schema_version']);
        $this->assertSame('success', $h1Res['body']['action_result']);
        $this->assertFalse($h1Res['body']['operation']['replayed']);
        $this->assertMatchesRegularExpression('/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/', $h1Res['body']['operation']['identity']['operation_id']);
        $this->assertFalse($h1Res['body']['data']['physical_quantity_changed']);
        $this->assertFalse($h1Res['body']['data']['condition_changed']);
        $this->assertSame([], $h1Res['body']['data']['movement_ids']);
        $this->assertSame('3', $h1Res['body']['data']['position_balances']['held']['value']);
        $this->assertSame('7', $h1Res['body']['data']['position_balances']['available']['value']);
        $h1Id = (string) $h1Res['body']['data']['hold']['id'];
        $h1OpId = (string) $h1Res['body']['operation']['identity']['operation_id'];

        // Idempotent replay & conflict
        $replay = $participant->recordStockHold($chapterId, $actor, 'hold-h1', $h1Payload);
        $this->assertSame(201, $replay['http_status']);
        $this->assertTrue($replay['body']['operation']['replayed']);
        $this->assertSame($h1Id, $replay['body']['data']['hold']['id']);

        $conflictPayload = $h1Payload;
        $conflictPayload['reason'] = 'Different payload';
        $conflict = $participant->recordStockHold($chapterId, $actor, 'hold-h1', $conflictPayload);
        $this->assertSame(409, $conflict['http_status']);
        $this->assertSame('IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD', $conflict['body']['blocking_reason']['code']);

        // Stale guard pin rejection
        $stale = $participant->recordStockHold($chapterId, $actor, 'hold-stale', $h1Payload);
        $this->assertSame(409, $stale['http_status']);
        $this->assertSame('stale', $stale['body']['action_result']);
        $this->assertSame('STALE_GUARD_PIN', $stale['body']['blocking_reason']['code']);

        // Overlapping Hold H2 on [2, 4): splits [0,3) into [0,2) and [2,3), adds [3,4). Union length = 4, NOT 5!
        $h2Res = $participant->recordStockHold($chapterId, $actor, 'hold-h2', [
            'item_variant_id' => $variantId,
            'stock_position_id' => (string) $positionId,
            'hold_kind' => 'quarantine',
            'reason' => 'Seal check on overlapping sack window',
            'quantity' => ['value' => '2', 'quantity_scale' => 3],
            'coverage_start_qty' => '2',
        ]);
        $this->assertSame(201, $h2Res['http_status']);
        $this->assertSame('4', $h2Res['body']['data']['position_balances']['held']['value']);
        $this->assertSame('4', $h2Res['body']['data']['position_balances']['blocked']['value']);
        $this->assertSame('6', $h2Res['body']['data']['position_balances']['available']['value']);

        // Clear H1 with expected_hold_row_version ([0, 3)): union drops to 2!
        $clearRes = $participant->clearStockHold($chapterId, $actor, 'clear-h1', [
            'hold_id' => $h1Id,
            'expected_hold_row_version' => 1,
            'clearance_kind' => 'released',
            'reason' => 'Inspection passed',
        ]);
        $this->assertSame(200, $clearRes['http_status']);
        $this->assertSame('released', $clearRes['body']['data']['hold']['status']);
        $this->assertSame('2', $clearRes['body']['data']['position_balances']['held']['value']);
        $this->assertSame('8', $clearRes['body']['data']['position_balances']['available']['value']);

        $clearAgain = $participant->clearStockHold($chapterId, $actor, 'clear-h1-again', ['hold_id' => $h1Id, 'clearance_kind' => 'released']);
        $this->assertSame(409, $clearAgain['http_status']);
        $this->assertSame('HOLD_ALREADY_CLEARED', $clearAgain['body']['blocking_reason']['code']);

        // Canonical lookup routes: by-key and by-id + 400 INVALID_LOOKUP + uncertain on unknown key
        $this->invGet("/api/v1/chapters/{$chapterId}/operations/by-key?action_code="
            .urlencode(StockHoldOperations::ACTION_CREATE_HOLD).'&idempotency_key=hold-h1')
            ->assertOk()
            ->assertJsonPath('action_result', 'success')
            ->assertJsonPath('operation.replayed', true)
            ->assertJsonPath('lookup_state', null);

        $this->invGet("/api/v1/chapters/{$chapterId}/operations/by-id/{$h1OpId}")
            ->assertOk()
            ->assertJsonPath('action_result', 'success')
            ->assertJsonPath('operation.identity.operation_id', $h1OpId);

        $this->invGet("/api/v1/chapters/{$chapterId}/operations/by-key?action_code=".urlencode(StockHoldOperations::ACTION_CREATE_HOLD))
            ->assertStatus(400)
            ->assertJsonPath('blocking_reason.code', 'INVALID_LOOKUP');

        $this->invGet("/api/v1/chapters/{$chapterId}/operations/by-key?action_code="
            .urlencode(StockHoldOperations::ACTION_CREATE_HOLD).'&idempotency_key=never-sent')
            ->assertOk()
            ->assertJsonPath('action_result', 'uncertain')
            ->assertJsonPath('input_policy', 'preserve')
            ->assertJsonPath('lookup_state', 'pending_or_not_visible');
    }

    public function test_donor_restrictions_non_usable_conditions_and_mysql_immutability(): void
    {
        $fixture = $this->createChapterFixture();
        $chapterId = $fixture['chapter_id'];

        $this->signInAs($fixture['inventory_email'], $fixture['password']);
        $unitId = (string) $this->invPost("/api/v1/chapters/{$chapterId}/inventory/units", [
            'code' => 'BTL',
            'name' => 'Bottles',
            'quantity_scale' => 0,
        ])->json('data.unit.id');
        $itemId = (string) $this->invPost("/api/v1/chapters/{$chapterId}/inventory/items", [
            'sku' => 'WTR-01',
            'name' => 'Drinking Water',
            'item_kind' => 'consumable',
            'base_unit_id' => $unitId,
        ])->json('data.item.id');
        $variantId = (string) $this->invPost("/api/v1/chapters/{$chapterId}/inventory/items/{$itemId}/variants", [
            'variant_code' => '1L',
            'name' => '1 Liter',
        ])->json('data.variant.id');
        $locationId = (string) $this->invPost("/api/v1/chapters/{$chapterId}/inventory/locations", [
            'code' => 'WH-WTR',
            'name' => 'Hydration Store',
            'location_kind' => 'warehouse',
        ])->json('data.location.id');

        $draftId = (string) $this->invPost("/api/v1/chapters/{$chapterId}/inventory/items/{$itemId}/policy-drafts", [
            'is_eligibility_approved' => true,
        ])->json('data.item_policy_version.id');
        $this->signInAs($fixture['approver_email'], $fixture['password'], $fixture['approver_codes'][0]);
        $this->invPost("/api/v1/chapters/{$chapterId}/inventory/item-policy-versions/{$draftId}/approve", [])->assertOk();

        $now = now()->format('Y-m-d H:i:s.u');
        $evReliefId = DB::table('events')->insertGetId([
            'chapter_id' => $chapterId,
            'code' => 'EV-RELIEF',
            'name' => 'Flood Relief',
            'status' => 'active',
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $evOtherId = DB::table('events')->insertGetId([
            'chapter_id' => $chapterId,
            'code' => 'EV-OTHER',
            'name' => 'Sports Fest',
            'status' => 'active',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $this->signInAs($fixture['inventory_email'], $fixture['password']);
        $restrRes = $this->invPost("/api/v1/chapters/{$chapterId}/inventory/restrictions", [
            'code' => 'DONOR-TYPHOON',
            'title' => 'Restricted to Flood Relief only',
            'donor_reference' => 'DONOR-2026-88',
            'event_scopes' => [
                ['event_id' => $evReliefId, 'scope_mode' => 'allow'],
                ['event_id' => $evOtherId, 'scope_mode' => 'deny'],
            ],
        ]);
        $restrRes->assertStatus(201);
        $restrVersionId = (int) $restrRes->json('data.restriction.restriction_version_id');

        $this->seedPositiveStockPosition($chapterId, (int) $variantId, (int) $locationId, 'usable', '5', 0, $restrVersionId);
        $this->seedPositiveStockPosition($chapterId, (int) $variantId, (int) $locationId, 'damaged', '4', 0);

        // Matching allowed event sees 5 eligible_available (damaged 4 excluded, total on_hand=9)
        $this->invGet("/api/v1/chapters/{$chapterId}/inventory/variants/{$variantId}/eligibility?event_id={$evReliefId}&requested_qty=5")
            ->assertOk()
            ->assertJsonPath('eligible', true)
            ->assertJsonPath('views.on_hand.value', '9')
            ->assertJsonPath('views.eligible_available.value', '5');

        // Denied event sees 0 eligible_available
        $this->invGet("/api/v1/chapters/{$chapterId}/inventory/variants/{$variantId}/eligibility?event_id={$evOtherId}&requested_qty=1")
            ->assertOk()
            ->assertJsonPath('eligible', false)
            ->assertJsonPath('views.eligible_available.value', '0');

        // Verify ysp_app runtime user cannot UPDATE or DELETE immutable ledger/history/seed tables
        $immutableChecks = [
            fn () => DB::table('stock_conditions')->where('code', 'usable')->update(['name' => 'Tampered']),
            fn () => DB::table('restrictions')->where('chapter_id', $chapterId)->delete(),
            fn () => DB::table('restriction_versions')->where('id', $restrVersionId)->update(['status' => 'superseded']),
            fn () => DB::table('stock_lots')->where('chapter_id', $chapterId)->delete(),
        ];
        foreach ($immutableChecks as $fn) {
            $blocked = false;
            try {
                $fn();
            } catch (QueryException) {
                $blocked = true;
            }
            $this->assertTrue($blocked, 'Expected MySQL 8.4 least-privilege / immutability trigger to reject mutation.');
        }
    }

    /**
     * @return array{
     *   chapter_id: int,
     *   inventory_email: string,
     *   approver_email: string,
     *   provider_email: string,
     *   inventory_membership_id: int,
     *   inventory_codes: list<string>,
     *   approver_codes: list<string>,
     *   provider_codes: list<string>,
     *   password: string
     * }
     */
    private function createChapterFixture(): array
    {
        $suffix = strtolower(Str::random(10));
        $password = 'TestPassword#2026!';
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 4]);
        $now = now()->format('Y-m-d H:i:s.u');

        $invEmail = "inv.{$suffix}@ysp.local";
        $appEmail = "head.{$suffix}@ysp.local";
        $provEmail = "prov.{$suffix}@ysp.local";

        $invUser = $this->createUser($invEmail, 'Inventory Officer', $hash, $now);
        $appUser = $this->createUser($appEmail, 'Chapter Head', $hash, $now);
        $provUser = $this->createUser($provEmail, 'Provider Admin', $hash, $now);

        $orgId = DB::table('organizations')->insertGetId([
            'name' => 'YSP Test Org '.$suffix,
        ]);

        $chapterId = DB::table('chapters')->insertGetId([
            'organization_id' => $orgId,
            'code' => 'CH-'.strtoupper($suffix),
            'name' => 'Chapter '.$suffix,
            'status' => 'live',
            'row_version' => 1,
            'provisioned_by_user_id' => $provUser['id'],
            'updated_at' => $now,
        ]);

        $invMemId = DB::table('memberships')->insertGetId([
            'chapter_id' => $chapterId,
            'user_id' => $invUser['id'],
            'status' => 'active',
            'authority_version' => 1,
            'authorized_by_user_id' => $appUser['id'],
            'authorized_at' => $now,
            'disabled_at' => null,
        ]);
        $appMemId = DB::table('memberships')->insertGetId([
            'chapter_id' => $chapterId,
            'user_id' => $appUser['id'],
            'status' => 'active',
            'authority_version' => 1,
            'authorized_by_user_id' => $appUser['id'],
            'authorized_at' => $now,
            'disabled_at' => null,
        ]);

        $this->grantRole($chapterId, $invMemId, 'INVENTORY');
        $this->grantRole($chapterId, $appMemId, 'CHAPTER_HEAD');

        DB::table('provider_role_grants')->insert([
            'organization_id' => $orgId,
            'user_id' => $provUser['id'],
            'role_code' => 'provisioner',
            'granted_by_user_id' => $appUser['id'],
            'starts_at' => $now,
            'reason' => 'P05 GOV-03 isolation test fixture',
        ]);

        return [
            'chapter_id' => $chapterId,
            'inventory_email' => $invEmail,
            'approver_email' => $appEmail,
            'provider_email' => $provEmail,
            'inventory_membership_id' => $invMemId,
            'inventory_codes' => $invUser['codes'],
            'approver_codes' => $appUser['codes'],
            'provider_codes' => $provUser['codes'],
            'password' => $password,
        ];
    }

    /** @return array{id: int, codes: list<string>} */
    private function createUser(string $email, string $name, string $passwordHash, string $now): array
    {
        $userId = DB::table('users')->insertGetId([
            'public_id' => InventoryFingerprint::newPublicId(),
            'name' => $name,
            'email' => $email,
            'email_key' => $email,
            'password_hash' => $passwordHash,
            'status' => 'active',
            'auth_version' => 1,
            'mfa_secret_ciphertext' => Crypt::encryptString('JBSWY3DPEHPK3PXP'),
            'mfa_confirmed_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $codes = [];
        for ($i = 1; $i <= 5; $i++) {
            $code = "ABCD-EFGH-JKLM-NPQ{$i}";
            $codes[] = $code;
            DB::table('user_recovery_codes')->insert([
                'user_id' => $userId,
                'code_hash' => hash('sha256', $code, true),
                'issued_at' => $now,
            ]);
        }

        return ['id' => $userId, 'codes' => $codes];
    }

    private function grantRole(int $chapterId, int $membershipId, string $roleCode): void
    {
        $roleId = (int) DB::table('roles')->where('code', $roleCode)->value('id');
        DB::table('duty_grants')->insert([
            'chapter_id' => $chapterId,
            'membership_id' => $membershipId,
            'role_id' => $roleId,
            'scope_kind' => 'chapter',
            'requesting_unit_id' => null,
            'monetary_limit' => null,
            'starts_at' => now()->subMinute()->format('Y-m-d H:i:s.u'),
            'ends_at' => null,
            'revoked_at' => null,
        ]);
    }

    private function seedPositiveStockPosition(
        int $chapterId,
        int $variantId,
        int $locationId,
        string $conditionCode,
        string $qty,
        int $scale,
        ?int $restrictionVersionId = null
    ): int {
        $now = now()->format('Y-m-d H:i:s.u');
        $conditionId = (int) DB::table('stock_conditions')->where('code', $conditionCode)->value('id');
        $lotId = DB::table('stock_lots')->insertGetId([
            'chapter_id' => $chapterId,
            'item_variant_id' => $variantId,
            'source_kind' => 'opening',
            'source_reference' => 'TEST-OPENING-'.Str::random(6),
            'restriction_version_id' => $restrictionVersionId,
            'received_at' => $now,
            'expires_at' => null,
            'initial_quantity' => $qty,
            'unit_scale' => $scale,
            'created_at' => $now,
        ]);

        return DB::table('stock_positions')->insertGetId([
            'chapter_id' => $chapterId,
            'item_variant_id' => $variantId,
            'stock_location_id' => $locationId,
            'stock_condition_id' => $conditionId,
            'stock_lot_id' => $lotId,
            'unit_scale' => $scale,
            'on_hand_qty' => $qty,
            'reserved_qty' => '0.000000',
            'held_qty' => '0.000000',
            'blocked_qty' => '0.000000',
            'dispatched_qty' => '0.000000',
            'in_booth_qty' => '0.000000',
            'inbound_pending_qty' => '0.000000',
            'position_version' => 1,
            'updated_at' => $now,
        ]);
    }

    private function signInAs(string $email, string $password, ?string $recoveryCode = null): void
    {
        $this->cookieJar = [];
        $this->sendBrowserRequest('GET', '/csrf-cookie')->assertNoContent();

        $res = $this->sendBrowserRequest('POST', '/api/v1/session/sign-in', [
            'email' => $email,
            'password' => $password,
        ]);
        $res->assertOk();

        if ($res->json('state') === 'mfa_challenge_required') {
            $this->assertNotNull($recoveryCode, 'MFA recovery code must be supplied for MFA-gated fixture identity.');
            $challengeId = (string) $res->json('challenge.id');
            $verify = $this->sendBrowserRequest('POST', '/api/v1/session/mfa/challenge/verify', [
                'challenge_id' => $challengeId,
                'method' => 'recovery_code',
                'recovery_code' => $recoveryCode,
            ]);
            $this->assertSame(200, $verify->getStatusCode(), 'MFA verify failed: '.$verify->getContent());
            $verify->assertJsonPath('state', 'authenticated');

            return;
        }

        $res->assertJsonPath('state', 'authenticated');
    }

    /** @return TestResponse<Response> */
    private function invGet(string $uri): TestResponse
    {
        return $this->sendBrowserRequest('GET', $uri);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, string>  $extraHeaders
     * @return TestResponse<Response>
     */
    private function invPost(string $uri, array $data, array $extraHeaders = []): TestResponse
    {
        if (! str_starts_with($uri, '/api/v1/session/') && ! array_key_exists('Idempotency-Key', $extraHeaders)) {
            $extraHeaders['Idempotency-Key'] = 'k-'.Str::uuid();
        }

        return $this->sendBrowserRequest('POST', $uri, $data, $extraHeaders);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, string>  $extraHeaders
     * @return TestResponse<Response>
     */
    private function invPatch(string $uri, array $data, array $extraHeaders = []): TestResponse
    {
        if (! array_key_exists('Idempotency-Key', $extraHeaders)) {
            $extraHeaders['Idempotency-Key'] = 'k-'.Str::uuid();
        }

        return $this->sendBrowserRequest('PATCH', $uri, $data, $extraHeaders);
    }

    /**
     * @param  array<string, mixed>|null  $payload
     * @param  array<string, string>  $extraHeaders
     * @return TestResponse<Response>
     */
    private function sendBrowserRequest(string $method, string $uri, ?array $payload = null, array $extraHeaders = []): TestResponse
    {
        $headers = [
            'Accept' => 'application/json',
            'Origin' => (string) config('app.url'),
        ];
        $content = null;
        if ($method !== 'GET') {
            $content = json_encode(($payload === null || $payload === []) ? new stdClass : $payload, JSON_THROW_ON_ERROR);
            $headers['CONTENT_TYPE'] = 'application/json';
            $headers['CONTENT_LENGTH'] = (string) strlen($content);
            $headers['X-XSRF-TOKEN'] = $this->cookieJar['XSRF-TOKEN'] ?? '';
        }
        $headers = array_merge($headers, $extraHeaders);

        $response = $this->call(
            $method,
            $uri,
            [],
            $this->cookieJar,
            [],
            $this->transformHeadersToServerVars($headers),
            $content
        );

        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->isCleared() || (string) $cookie->getValue() === '') {
                unset($this->cookieJar[$cookie->getName()]);
            } else {
                $this->cookieJar[$cookie->getName()] = (string) $cookie->getValue();
            }
        }

        return $response;
    }
}
