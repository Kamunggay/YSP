<?php

namespace Tests\Feature\Stage1A;

use App\Models\BrowserSession;
use App\Models\CatalogueUnit;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\OpeningCount;
use App\Models\OpeningRm;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
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
            'duty_code' => 'INVENTORY',
            'status' => 'active',
            'is_alternate' => false,
            'valid_from' => now()->subDay(),
            'version' => 1,
        ]);
    }

    public function test_user_memberships_and_chapter_access(): void
    {
        $membershipResponse = $this->asOfficer($this->userId)
            ->get('/api/v1/auth/memberships');
        $membershipResponse->assertStatus(200)
            ->assertJsonPath('data.0.chapter.reference', 'SYN-CEBU');

        $contextResponse = $this->asOfficer($this->userId)
            ->get("/api/v1/chapters/{$this->chapterId}/context");
        $contextResponse->assertStatus(200)
            ->assertJsonPath('data.user_id', $this->userId)
            ->assertJsonPath('data.membership.chapter.id', $this->chapterId);

        $accessResponse = $this->asOfficer($this->userId)
            ->get("/api/v1/chapters/{$this->chapterId}/access");
        $accessResponse->assertStatus(200)
            ->assertJsonCount(24, 'data.actions')
            ->assertJsonPath('data.chapter_id', $this->chapterId);
    }

    public function test_evidence_upload_computing_authoritative_sha256_digest(): void
    {
        $rawBytes = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
        $expectedSha256 = hash('sha256', $rawBytes);

        $uploadedFile = UploadedFile::fake()->createWithContent('receiving_receipt.pdf', $rawBytes);

        $officer = User::findOrFail($this->userId);
        $officer->dutyGrants()->create(['chapter_id' => $this->chapterId, 'duty_code' => 'RECEIVING']);
        $ipc = OpeningCount::create(['chapter_id' => $this->chapterId, 'created_by' => $officer->id]);
        $rm = OpeningRm::create(['chapter_id' => $this->chapterId, 'ipc_id' => $ipc->id]);

        // Upload
        $response = $this->asOfficer($this->userId)
            ->post("/api/v1/chapters/{$this->chapterId}/evidence", [
                'purpose' => 'opening_receipt',
                'record_id' => $rm->id,
                'attachments' => [$uploadedFile],
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.technical_state', 'ready')
            ->assertJsonPath('data.attachments.0.sha256', $expectedSha256)
            ->assertJsonPath('data.attachments.0.media_type', 'application/pdf');

        $evidenceId = $response->json('data.evidence_id');
        $versionId = $response->json('data.version_id');
        $attachmentId = $response->json('data.attachments.0.attachment_id');

        // Read single evidence
        $readResponse = $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}");
        $readResponse->assertStatus(200)
            ->assertJsonPath('data.evidence_id', $evidenceId)
            ->assertJsonPath('data.current_version.version', 1);

        // List versions
        $versionsResponse = $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions");
        $versionsResponse->assertStatus(200)
            ->assertJsonCount(1, 'data');

        // Replace version
        $newRawBytes = $rawBytes."\n% New Version Appended";
        $newFile = UploadedFile::fake()->createWithContent('updated_receipt.pdf', $newRawBytes);
        $replaceResponse = $this->asOfficer($this->userId)
            ->post("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions", [
                'replacement_reason' => 'Clearer scan attached.',
                'attachments' => [$newFile],
            ]);

        $replaceResponse->assertStatus(201)
            ->assertJsonPath('data.version', 2)
            ->assertJsonPath('data.replacement_reason', 'Clearer scan attached.');

        $wrongVersionId = $replaceResponse->json('data.version_id');
        $this->asOfficer($this->userId)
            ->get("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions/{$wrongVersionId}/attachments/{$attachmentId}/content")
            ->assertNotFound()->assertJsonPath('error.code', 'evidence_not_found');

        // Retrieve attachment content
        $contentResponse = $this->asOfficer($this->userId)
            ->get("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions/{$versionId}/attachments/{$attachmentId}/content");
        $contentResponse->assertStatus(200)
            ->assertHeader('Content-Type', 'application/pdf');
        $this->assertEquals($rawBytes, $contentResponse->getContent());
    }

    public function test_catalogue_crud_version_increments_and_history_capture(): void
    {
        // 1. Create Unit
        $unitResponse = $this->asOfficer($this->userId)
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
        $readUnit = $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/catalogue/units/{$unitId}");
        $readUnit->assertStatus(200)
            ->assertJsonPath('data.code', 'PC');

        // Update Unit
        $updateUnit = $this->asOfficer($this->userId)
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
        $unitHistory = $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/catalogue/units/{$unitId}/history");
        $unitHistory->assertStatus(200)
            ->assertJsonCount(2, 'data');

        // 2. Create Item
        $itemResponse = $this->asOfficer($this->userId)
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
        $updateItem = $this->asOfficer($this->userId)
            ->putJson("/api/v1/chapters/{$this->chapterId}/catalogue/items/{$itemId}", [
                'expected_material_version' => 1,
                'description' => 'Official YSP Polo Shirt - Revised Material',
                'unit_id' => $unitId,
                'reason' => 'Updated fabric description',
            ]);

        $updateItem->assertStatus(200)
            ->assertJsonPath('data.resource.material_version', 2);

        // 3. Create Variant
        $variantResponse = $this->asOfficer($this->userId)
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
        $locResponse = $this->asOfficer($this->userId)
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
        $opResponse = $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/catalogue/operations/{$itemResponse->json('data.operation_id')}");
        $opResponse->assertStatus(200)
            ->assertJsonPath('data.resource_id', $itemId)
            ->assertJsonPath('data.outcome', 'committed');
    }

    public function test_unit_immutability_guard_rejects_updating_locked_identity(): void
    {
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
        $response1 = $this->asOfficer($this->userId)
            ->putJson("/api/v1/chapters/{$this->chapterId}/catalogue/units/{$unit->id}", [
                'name' => 'Kilogram Modified',
                'quantity_kind' => 'measured',
                'quantity_scale' => 2, // Changed from 3!
                'reason' => 'Illegal scale change',
            ]);

        $response1->assertStatus(422)
            ->assertJsonPath('error.code', 'quantity_identity_locked');

        // Attempting to change quantity_kind must also be rejected with 422
        $response2 = $this->asOfficer($this->userId)
            ->putJson("/api/v1/chapters/{$this->chapterId}/catalogue/units/{$unit->id}", [
                'name' => 'Kilogram Modified',
                'quantity_kind' => 'piece', // Changed from measured!
                'quantity_scale' => 0,
                'reason' => 'Illegal kind change',
            ]);

        $response2->assertStatus(422)
            ->assertJsonPath('error.code', 'quantity_identity_locked');

        // Non-identity update (e.g. name only) must succeed
        $response3 = $this->asOfficer($this->userId)
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
        $response = $this->asOfficer($unauthorizedUserId)
            ->postJson("/api/v1/chapters/{$this->chapterId}/catalogue/items", [
                'code' => 'ILLEGAL-ITEM',
                'description' => 'Unauthorized Item',
                'unit_id' => (string) Str::uuid(),
            ]);

        $response->assertStatus(403)
            ->assertJsonPath('error.code', 'duty_denied');

        // Authorized user with INVENTORY_CUSTODIAN duty succeeds -> 201 Created
        $authorizedResponse = $this->asOfficer($this->userId)
            ->postJson("/api/v1/chapters/{$this->chapterId}/catalogue/items", [
                'code' => 'LEGAL-ITEM',
                'description' => 'Authorized Item Creation',
                'unit_id' => (string) Str::uuid(),
            ]);

        $authorizedResponse->assertStatus(201)
            ->assertJsonPath('data.resource.code', 'LEGAL-ITEM');
    }

    private function asOfficer(string $id): self
    {
        $origin = 'https://inventory.example.invalid';
        config(['app.url' => $origin]);
        app('url')->useOrigin($origin);
        app('url')->forceScheme('https');

        $session = new BrowserSession([
            'user_id' => $id, 'user_version' => User::findOrFail($id)->version,
            'authentication_method' => 'password', 'authenticated_at' => now(), 'expires_at' => now()->addHour(),
        ]);
        $token = $session->rotateToken();
        $session->save();

        return $this->withCredentials()->withUnencryptedCookie('ysp_session', $token)
            ->withHeaders(['Origin' => $origin, 'X-XSRF-TOKEN' => $session->csrf_token]);
    }
}
