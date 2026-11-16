<?php

namespace Tests\Feature\Stage1A;

use App\Models\AuditLog;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueOperation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\CatalogueVersionHistory;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use App\Models\PolicyRecord;
use App\Models\User;
use App\Models\UserMfaCredential;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Str;
use Tests\TestCase;

class InventoryStage1ATest extends TestCase
{
    use RefreshDatabase;

    private string $chapterId;
    private string $userId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->chapterId = (string) Str::uuid();
        $this->userId = (string) Str::uuid();

        Chapter::create([
            'id' => $this->chapterId,
            'code' => 'SYN-CEBU',
            'name' => 'Cebu Chapter',
            'status' => 'live',
            'version' => 1,
        ]);

        User::create([
            'id' => $this->userId,
            'public_id' => 'custodian@example.invalid',
            'name' => 'Inventory Custodian',
            'email' => 'custodian@example.invalid',
            'password_hash' => hash('sha256', 'Password123!'),
            'status' => 'active',
            'version' => 1,
        ]);

        ChapterMembership::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $this->userId,
            'membership_status' => 'active',
            'version' => 1,
        ]);

        DutyGrant::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $this->userId,
            'duty_code' => 'INVENTORY_CUSTODIAN',
            'status' => 'active',
            'is_alternate' => false,
            'valid_from' => now()->subDay(),
            'version' => 1,
        ]);
    }

    public function test_user_authentication_session_memberships_and_chapter_access(): void
    {
        // 1. CSRF
        $csrfResponse = $this->get('/api/v1/auth/csrf');
        $csrfResponse->assertStatus(204);

        // 2. Sign In
        $signInResponse = $this->postJson('/api/v1/auth/sign-in', [
            'login' => 'custodian@example.invalid',
            'password' => 'Password123!',
        ]);
        $signInResponse->assertStatus(200)
            ->assertJsonPath('data.state', 'authenticated')
            ->assertJsonPath('data.user.id', $this->userId);

        // 3. Read Session
        $sessionResponse = $this->withHeaders(['X-User-Id' => $this->userId])
            ->getJson('/api/v1/auth/session');
        $sessionResponse->assertStatus(200)
            ->assertJsonPath('data.state', 'authenticated')
            ->assertJsonPath('data.user.id', $this->userId);

        // 4. Memberships
        $membershipResponse = $this->withHeaders(['X-User-Id' => $this->userId])
            ->getJson('/api/v1/auth/memberships');
        $membershipResponse->assertStatus(200)
            ->assertJsonPath('data.0.chapter.reference', 'SYN-CEBU');

        // 5. Chapter Context
        $contextResponse = $this->withHeaders(['X-User-Id' => $this->userId])
            ->getJson("/api/v1/chapters/{$this->chapterId}/context");
        $contextResponse->assertStatus(200)
            ->assertJsonPath('data.user_id', $this->userId)
            ->assertJsonPath('data.membership.chapter.id', $this->chapterId);

        // 6. Chapter Access (24 actions)
        $accessResponse = $this->withHeaders(['X-User-Id' => $this->userId])
            ->getJson("/api/v1/chapters/{$this->chapterId}/access");
        $accessResponse->assertStatus(200)
            ->assertJsonCount(24, 'data.actions')
            ->assertJsonPath('data.chapter_id', $this->chapterId);

        // 7. Sign Out
        $signOutResponse = $this->post('/api/v1/auth/sign-out');
        $signOutResponse->assertStatus(204);
    }

    public function test_all_8_cli_setup_commands_execution_and_database_state(): void
    {
        $newUserId = (string) Str::uuid();
        $newChapterId = (string) Str::uuid();
        $membershipId = (string) Str::uuid();
        $dutyGrantId = (string) Str::uuid();
        $altGrantId = (string) Str::uuid();
        $policyId = (string) Str::uuid();

        // 1. prepare-account
        $exit1 = Artisan::call('app:prepare-account', [
            '--target-id' => $newUserId,
            '--login' => 'officer.new@example.invalid',
            '--display-name' => 'Officer New',
        ]);
        $this->assertEquals(0, $exit1);
        $this->assertDatabaseHas('users', ['id' => $newUserId, 'email' => 'officer.new@example.invalid']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'controlled:prepareAccount']);

        // 2. set-account-status
        $exit2 = Artisan::call('app:set-account-status', [
            '--target-id' => $newUserId,
            '--status' => 'disabled',
            '--expected-version' => 1,
        ]);
        $this->assertEquals(0, $exit2);
        $this->assertDatabaseHas('users', ['id' => $newUserId, 'status' => 'disabled', 'version' => 2]);

        // 3. prepare-chapter
        $exit3 = Artisan::call('app:prepare-chapter', [
            '--target-id' => $newChapterId,
            '--reference' => 'SYN-DAVAO',
            '--display-name' => 'Davao Chapter',
            '--initial-head-user-id' => $newUserId,
        ]);
        $this->assertEquals(0, $exit3);
        $this->assertDatabaseHas('chapters', ['id' => $newChapterId, 'code' => 'SYN-DAVAO']);

        // 4. set-membership
        $exit4 = Artisan::call('app:set-membership', [
            '--target-id' => $membershipId,
            '--chapter-id' => $newChapterId,
            '--user-id' => $newUserId,
            '--status' => 'active',
            '--expected-version' => 0,
        ]);
        $this->assertEquals(0, $exit4);
        $this->assertDatabaseHas('chapter_memberships', ['id' => $membershipId, 'membership_status' => 'active']);

        // 5. set-duty
        $exit5 = Artisan::call('app:set-duty', [
            '--target-id' => $dutyGrantId,
            '--chapter-id' => $newChapterId,
            '--user-id' => $newUserId,
            '--duty' => 'INVENTORY_REVIEWER',
            '--status' => 'active',
            '--expected-version' => 0,
        ]);
        $this->assertEquals(0, $exit5);
        $this->assertDatabaseHas('duty_grants', ['id' => $dutyGrantId, 'duty_code' => 'INVENTORY_REVIEWER']);

        // 6. set-alternate
        $exit6 = Artisan::call('app:set-alternate', [
            '--target-id' => $altGrantId,
            '--chapter-id' => $newChapterId,
            '--duty' => 'INVENTORY_CUSTODIAN',
            '--replaces-user-id' => $this->userId,
            '--status' => 'active',
            '--expected-version' => 0,
        ]);
        $this->assertEquals(0, $exit6);
        $this->assertDatabaseHas('duty_grants', ['id' => $altGrantId, 'is_alternate' => true]);

        // 7. record-policy
        $exit7 = Artisan::call('app:record-policy', [
            '--target-id' => $policyId,
            '--chapter-id' => $newChapterId,
            '--setting-key' => 'rop_limits',
            '--value' => json_encode(['threshold' => 50]),
            '--expected-version' => 0,
        ]);
        $this->assertEquals(0, $exit7);
        $this->assertDatabaseHas('policy_records', ['id' => $policyId, 'policy_code' => 'rop_limits']);

        // 8. reset-mfa
        UserMfaCredential::create([
            'id' => (string) Str::uuid(),
            'user_id' => $newUserId,
            'secret' => 'TESTSECRETKEY123456789012345678',
            'is_confirmed' => true,
            'recovery_codes' => ['CODE1', 'CODE2'],
        ]);
        $exit8 = Artisan::call('app:reset-mfa', [
            '--target-id' => $newUserId,
            '--expected-version' => 1,
        ]);
        $this->assertEquals(0, $exit8);
        $this->assertDatabaseHas('user_mfa_credentials', ['user_id' => $newUserId, 'is_confirmed' => false]);
    }

    public function test_evidence_upload_computing_authoritative_sha256_digest(): void
    {
        $rawBytes = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
        $expectedSha256 = hash('sha256', $rawBytes);

        $uploadedFile = UploadedFile::fake()->createWithContent('receiving_receipt.pdf', $rawBytes);

        // Upload
        $response = $this->withHeaders(['X-User-Id' => $this->userId])
            ->post("/api/v1/chapters/{$this->chapterId}/evidence", [
                'purpose' => 'opening_receipt',
                'record_id' => (string) Str::uuid(),
                'attachments' => [$uploadedFile],
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.technical_state', 'ready')
            ->assertJsonPath('data.attachments.0.sha256', $expectedSha256)
            ->assertJsonPath('data.attachments.0.media_type', 'application/pdf');

        $evidenceId = $response->json('data.evidence_id');
        $attachmentId = $response->json('data.attachments.0.attachment_id');

        // Read single evidence
        $readResponse = $this->withHeaders(['X-User-Id' => $this->userId])
            ->getJson("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}");
        $readResponse->assertStatus(200)
            ->assertJsonPath('data.evidence_id', $evidenceId)
            ->assertJsonPath('data.current_version.version', 1);

        // List versions
        $versionsResponse = $this->withHeaders(['X-User-Id' => $this->userId])
            ->getJson("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions");
        $versionsResponse->assertStatus(200)
            ->assertJsonCount(1, 'data');

        // Replace version
        $newRawBytes = $rawBytes."\n% New Version Appended";
        $newFile = UploadedFile::fake()->createWithContent('updated_receipt.pdf', $newRawBytes);
        $replaceResponse = $this->withHeaders(['X-User-Id' => $this->userId])
            ->post("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions", [
                'replacement_reason' => 'Clearer scan attached.',
                'attachments' => [$newFile],
            ]);

        $replaceResponse->assertStatus(201)
            ->assertJsonPath('data.version', 2)
            ->assertJsonPath('data.replacement_reason', 'Clearer scan attached.');

        // Retrieve attachment content
        $contentResponse = $this->get("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions/1/attachments/{$attachmentId}/content");
        $contentResponse->assertStatus(200)
            ->assertHeader('Content-Type', 'application/pdf');
        $this->assertEquals($rawBytes, $contentResponse->getContent());
    }

    public function test_catalogue_crud_version_increments_and_history_capture(): void
    {
        $headers = ['X-User-Id' => $this->userId];

        // 1. Create Unit
        $unitResponse = $this->withHeaders($headers)
            ->postJson("/api/v1/chapters/{$this->chapterId}/catalogue/units", [
                'code' => 'PC',
                'name' => 'Piece',
                'quantity_kind' => 'piece',
                'quantity_scale' => 0,
                'reason' => 'Standard piece unit',
            ]);

        $unitResponse->assertStatus(201)
            ->assertJsonPath('data.resource.code', 'PC')
            ->assertJsonPath('data.resource.material_version', 1);

        $unitId = $unitResponse->json('data.resource.id');

        // Read Unit
        $readUnit = $this->withHeaders($headers)
            ->getJson("/api/v1/chapters/{$this->chapterId}/catalogue/units/{$unitId}");
        $readUnit->assertStatus(200)
            ->assertJsonPath('data.code', 'PC');

        // Update Unit
        $updateUnit = $this->withHeaders($headers)
            ->putJson("/api/v1/chapters/{$this->chapterId}/catalogue/units/{$unitId}", [
                'expected_material_version' => 1,
                'name' => 'Single Piece',
                'quantity_kind' => 'piece',
                'quantity_scale' => 0,
                'reason' => 'Rename for clarity',
            ]);

        $updateUnit->assertStatus(200)
            ->assertJsonPath('data.resource.name', 'Single Piece')
            ->assertJsonPath('data.resource.material_version', 2);

        // Read Unit History
        $unitHistory = $this->withHeaders($headers)
            ->getJson("/api/v1/chapters/{$this->chapterId}/catalogue/units/{$unitId}/history");
        $unitHistory->assertStatus(200)
            ->assertJsonCount(2, 'data');

        // 2. Create Item
        $itemResponse = $this->withHeaders($headers)
            ->postJson("/api/v1/chapters/{$this->chapterId}/catalogue/items", [
                'code' => 'TSHIRT',
                'description' => 'Official YSP Polo Shirt',
                'unit_id' => $unitId,
                'reason' => 'Initial merchandise catalog setup',
            ]);

        $itemResponse->assertStatus(201)
            ->assertJsonPath('data.resource.code', 'TSHIRT')
            ->assertJsonPath('data.resource.material_version', 1);

        $itemId = $itemResponse->json('data.resource.id');

        // Update Item
        $updateItem = $this->withHeaders($headers)
            ->putJson("/api/v1/chapters/{$this->chapterId}/catalogue/items/{$itemId}", [
                'expected_material_version' => 1,
                'description' => 'Official YSP Polo Shirt - Revised Material',
                'unit_id' => $unitId,
                'reason' => 'Updated fabric description',
            ]);

        $updateItem->assertStatus(200)
            ->assertJsonPath('data.resource.material_version', 2);

        // 3. Create Variant
        $variantResponse = $this->withHeaders($headers)
            ->postJson("/api/v1/chapters/{$this->chapterId}/catalogue/variants", [
                'code' => 'TSHIRT-BLU-L',
                'item_id' => $itemId,
                'label' => 'Blue Large Polo',
                'unit_id' => $unitId,
                'quantity_scale' => 0,
                'reason' => 'First color/size variant',
            ]);

        $variantResponse->assertStatus(201)
            ->assertJsonPath('data.resource.code', 'TSHIRT-BLU-L')
            ->assertJsonPath('data.resource.material_version', 1);

        $variantId = $variantResponse->json('data.resource.id');

        // 4. Create Location
        $locResponse = $this->withHeaders($headers)
            ->postJson("/api/v1/chapters/{$this->chapterId}/catalogue/locations", [
                'code' => 'ROOM-A',
                'name' => 'Main Room A Shelf 1',
                'kind' => 'stockroom',
                'custodian_id' => $this->userId,
                'reason' => 'Primary storage rack',
            ]);

        $locResponse->assertStatus(201)
            ->assertJsonPath('data.resource.code', 'ROOM-A')
            ->assertJsonPath('data.resource.material_version', 1);

        $locId = $locResponse->json('data.resource.id');

        // 5. Check Operations query
        $opResponse = $this->withHeaders($headers)
            ->getJson("/api/v1/chapters/{$this->chapterId}/catalogue/operations/{$itemResponse->json('data.operation_id')}");
        $opResponse->assertStatus(200)
            ->assertJsonPath('data.resource_id', $itemId)
            ->assertJsonPath('data.outcome', 'committed');
    }

    public function test_unit_immutability_guard_rejects_updating_locked_identity(): void
    {
        $headers = ['X-User-Id' => $this->userId];

        // Create unit
        $unit = CatalogueUnit::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'code' => 'KG',
            'name' => 'Kilogram',
            'quantity_kind' => 'measured',
            'quantity_scale' => 3,
            'quantity_identity_locked' => true, // LOCKED!
            'material_version' => 1,
            'state' => 'active',
        ]);

        // Attempting to change quantity_scale must be rejected with 422
        $response1 = $this->withHeaders($headers)
            ->putJson("/api/v1/chapters/{$this->chapterId}/catalogue/units/{$unit->id}", [
                'name' => 'Kilogram Modified',
                'quantity_kind' => 'measured',
                'quantity_scale' => 2, // Changed from 3!
                'reason' => 'Illegal scale change',
            ]);

        $response1->assertStatus(422)
            ->assertJsonPath('error.code', 'quantity_identity_locked');

        // Attempting to change quantity_kind must also be rejected with 422
        $response2 = $this->withHeaders($headers)
            ->putJson("/api/v1/chapters/{$this->chapterId}/catalogue/units/{$unit->id}", [
                'name' => 'Kilogram Modified',
                'quantity_kind' => 'piece', // Changed from measured!
                'quantity_scale' => 0,
                'reason' => 'Illegal kind change',
            ]);

        $response2->assertStatus(422)
            ->assertJsonPath('error.code', 'quantity_identity_locked');

        // Non-identity update (e.g. name only) must succeed
        $response3 = $this->withHeaders($headers)
            ->putJson("/api/v1/chapters/{$this->chapterId}/catalogue/units/{$unit->id}", [
                'name' => 'Kilogram (Metric)',
                'quantity_kind' => 'measured',
                'quantity_scale' => 3, // Unchanged
                'reason' => 'Update display label only',
            ]);

        $response3->assertStatus(200)
            ->assertJsonPath('data.resource.name', 'Kilogram (Metric)')
            ->assertJsonPath('data.resource.material_version', 2);
    }

    public function test_duty_authority_enforcement_unauthorized_caller_receives_403(): void
    {
        // Create user with NO duty or different duty (e.g. SALES_OFFICER)
        $unauthorizedUserId = (string) Str::uuid();
        User::create([
            'id' => $unauthorizedUserId,
            'public_id' => 'sales@example.invalid',
            'name' => 'Sales Officer',
            'email' => 'sales@example.invalid',
            'password_hash' => hash('sha256', 'Password123!'),
            'status' => 'active',
            'version' => 1,
        ]);

        ChapterMembership::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $unauthorizedUserId,
            'membership_status' => 'active',
            'version' => 1,
        ]);

        DutyGrant::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $unauthorizedUserId,
            'duty_code' => 'SALES_OFFICER',
            'status' => 'active',
            'is_alternate' => false,
            'valid_from' => now()->subDay(),
            'version' => 1,
        ]);

        // Attempt to create catalogue item with unauthorized user -> 403 Forbidden
        $response = $this->withHeaders(['X-User-Id' => $unauthorizedUserId])
            ->postJson("/api/v1/chapters/{$this->chapterId}/catalogue/items", [
                'code' => 'ILLEGAL-ITEM',
                'description' => 'Unauthorized Item',
                'unit_id' => (string) Str::uuid(),
            ]);

        $response->assertStatus(403)
            ->assertJsonPath('error', 'FORBIDDEN_DUTY');

        // Authorized user with INVENTORY_CUSTODIAN duty succeeds -> 201 Created
        $authorizedResponse = $this->withHeaders(['X-User-Id' => $this->userId])
            ->postJson("/api/v1/chapters/{$this->chapterId}/catalogue/items", [
                'code' => 'LEGAL-ITEM',
                'description' => 'Authorized Item Creation',
                'unit_id' => (string) Str::uuid(),
            ]);

        $authorizedResponse->assertStatus(201)
            ->assertJsonPath('data.resource.code', 'LEGAL-ITEM');
    }
}
