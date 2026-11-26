<?php

namespace Tests\Feature\Stage1A;

use App\Models\BrowserSession;
use App\Models\CatalogueUnit;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\EvidenceBlob;
use App\Models\OpeningCount;
use App\Models\OpeningRm;
use App\Models\StockHold;
use App\Models\User;
use App\Models\UserMfaCredential;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Mockery;
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
        $rawBytes = $this->paperPdf();
        $expectedSha256 = hash('sha256', $rawBytes);
        $rm = $this->evidenceDraft();
        $key = (string) Str::uuid();
        $image = imagecreatetruecolor(1, 1);
        ob_start();
        imagepng($image);
        $png = ob_get_clean();
        ob_start();
        imagejpeg($image);
        $jpeg = ob_get_clean();
        $files = [['application/pdf', $rawBytes], ['image/png', $png], ['image/jpeg', $jpeg]];
        $this->asOfficer($this->userId);

        // Upload
        $response = $this->uploadPaper($rm, $key, $files);

        $this->assertSame(201, $response->status(), $response->getContent());
        $response->assertHeader('X-Action-Replayed', 'false')
            ->assertHeader('Cache-Control', 'no-store')
            ->assertJsonPath('data.technical_state', 'ready')
            ->assertJsonPath('data.attachments.0.sha256', $expectedSha256)
            ->assertJsonPath('data.attachments.0.media_type', 'application/pdf')
            ->assertJsonPath('data.attachments.1.media_type', 'image/png')
            ->assertJsonPath('data.attachments.1.position', 2)
            ->assertJsonPath('data.attachments.2.media_type', 'image/jpeg')
            ->assertJsonPath('data.attachments.2.position', 3);

        $evidenceId = $response->json('data.evidence_id');
        $versionId = $response->json('data.version_id');
        $attachmentId = $response->json('data.attachments.0.attachment_id');
        $this->assertMatchesRegularExpression('/\.\d{6}Z$/', $response->json('data.uploaded_at'));

        $rm->update(['status' => 'POSTED']);
        $this->uploadPaper($rm, $key, $files)->assertStatus(201)
            ->assertHeader('X-Action-Replayed', 'true')->assertExactJson($response->json());
        $this->uploadPaper($rm, $key, array_reverse($files))->assertConflict()
            ->assertJsonPath('error.code', 'action_key_conflict');
        $otherDraft = StockHold::create([
            'chapter_id' => $this->chapterId, 'reason_code' => 'damaged', 'reason' => 'Synthetic hold.',
            'placed_by_user_id' => $this->userId,
        ]);
        $this->uploadPaper($otherDraft, $key, $files)->assertConflict()
            ->assertJsonPath('error.code', 'action_key_conflict');
        $this->uploadPaper($rm, (string) Str::uuid(), $files)->assertConflict()
            ->assertJsonPath('error.code', 'target_locked');
        $rm->update(['status' => 'DRAFT']);
        $this->assertDatabaseCount('evidence_records', 1);
        $this->assertDatabaseHas('action_receipts', ['key' => $key, 'operation' => 'uploadPaperEvidence', 'user_id' => $this->userId]);
        $this->assertDatabaseCount('domain_notification_outbox', 1);
        $this->assertDatabaseHas('domain_notification_outbox', [
            'event_name' => 'stage1.paper-evidence.changed.v1', 'resource_id' => $evidenceId, 'status' => 'pending',
        ]);

        // Read single evidence
        $readResponse = $this->asOfficer($this->userId)
            ->get("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}");
        $readResponse->assertStatus(200)
            ->assertJsonPath('data.evidence_id', $evidenceId)
            ->assertJsonPath('data.current_version', $response->json('data'));
        $versionUrl = "/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions/{$versionId}";
        $this->get($versionUrl)->assertOk()->assertExactJson($response->json());
        $pngId = $response->json('data.attachments.1.attachment_id');
        $content = $this->get("{$versionUrl}/attachments/{$pngId}/content", ['Range' => 'bytes=0-1']);
        $content->assertOk()->assertHeader('Content-Disposition', "attachment; filename=\"{$pngId}.png\"")
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertSame($png, $content->getContent());
        $legacyVersion = (string) Str::uuid();
        $legacyAttachment = (string) Str::uuid();
        $legacyPath = "evidence/{$this->chapterId}/{$evidenceId}/{$legacyVersion}/{$legacyAttachment}";
        Storage::disk('evidence')->put($legacyPath, $rawBytes);
        EvidenceBlob::create([
            'id' => $legacyAttachment, 'evidence_id' => $evidenceId, 'version' => 1,
            'sha256_hash' => $expectedSha256, 'file_size' => strlen($rawBytes), 'mime_type' => 'application/pdf',
            'created_by' => $this->userId, 'payload_path' => $legacyPath,
        ]);
        $this->get("{$versionUrl}/attachments/{$legacyAttachment}/content")->assertNotFound()
            ->assertJsonPath('error.code', 'evidence_not_found');
        $this->get($versionUrl)->assertOk()->assertExactJson($response->json());
        $this->get("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}")
            ->assertOk()->assertJsonPath('data.current_version', $response->json('data'));

        // List versions
        $versionsResponse = $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions");
        $versionsResponse->assertStatus(200)
            ->assertJsonCount(2, 'data');

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

    public function test_evidence_rejects_invalid_sets_without_publishing(): void
    {
        $rm = $this->evidenceDraft();
        $key = (string) Str::uuid();
        $this->asOfficer($this->userId);
        $valid = ['application/pdf', $this->paperPdf()];
        foreach ([
            [['image/png', $valid[1]], 'content_mismatch'],
            [['application/pdf', "%PDF-1.4\n%%EOF\n"], 'malformed_content'],
            [['application/pdf', $this->paperPdf(' /OpenAction << /S /JavaScript /JS (example) >>')], 'unsafe_content'],
            [['application/pdf', $this->paperPdf(' /AF [3 0 R]')], 'unsafe_content'],
            [['application/pdf', ''], 'empty_file'],
        ] as [$file, $code]) {
            $this->uploadPaper($rm, $key, [$valid, $file])->assertUnprocessable()
                ->assertJsonPath('error.fields.0.pointer', '/attachments/1')->assertJsonPath('error.fields.0.code', $code);
        }
        $this->uploadPaper($rm, $key, [$valid, ['application/pdf', str_repeat('x', 10485761)]])
            ->assertStatus(413)->assertJsonPath('error.code', 'evidence_too_large');
        $this->uploadPaper($rm, $key, array_fill(0, 257, $valid))
            ->assertStatus(413)->assertJsonPath('error.code', 'evidence_too_large');
        $this->uploadPaper($rm, $key, [$valid], extra: 'purpose')->assertUnprocessable()
            ->assertJsonPath('error.fields.0.pointer', '/purpose');
        $this->uploadPaper($rm, $key, [$valid], finished: false)->assertBadRequest()
            ->assertJsonPath('error.code', 'malformed_request');
        $this->uploadPaper($rm, 'invalid-key', [$valid])->assertBadRequest()
            ->assertJsonPath('error.code', 'malformed_request');
        $this->postJson("/api/v1/chapters/{$this->chapterId}/evidence", [], ['X-Action-Key' => $key])
            ->assertStatus(415)->assertJsonPath('error.code', 'unsupported_media_type');
        $this->assertDatabaseCount('evidence_records', 0);
        $this->assertDatabaseCount('action_receipts', 0);
        $this->assertDatabaseCount('domain_notification_outbox', 0);
    }

    public function test_evidence_storage_failure_rolls_back_and_prunes_only_unpublished_bytes(): void
    {
        $rm = $this->evidenceDraft();
        $file = ['application/pdf', $this->paperPdf()];
        $this->asOfficer($this->userId);
        $accepted = $this->uploadPaper($rm, (string) Str::uuid(), [$file])->assertCreated()->json('data');

        $disk = Storage::disk('evidence');
        $failingDisk = Mockery::mock(FilesystemAdapter::class);
        $failingDisk->shouldReceive('put')->once()->ordered()->andReturnUsing($disk->put(...));
        $failingDisk->shouldReceive('put')->once()->ordered()->andReturnFalse();
        $failingDisk->shouldReceive('path')->andReturnUsing($disk->path(...));
        Storage::set('evidence', $failingDisk);

        $key = (string) Str::uuid();
        $this->uploadPaper($rm, $key, [$file, $file])->assertServiceUnavailable()
            ->assertJsonPath('error.code', 'evidence_unavailable');
        Storage::set('evidence', $disk);
        $this->assertDatabaseCount('evidence_records', 1);
        $this->assertDatabaseCount('evidence_blobs', 1);
        $this->assertDatabaseMissing('action_receipts', ['key' => $key]);
        $this->assertDatabaseCount('domain_notification_outbox', 1);
        $this->assertCount(2, $disk->allFiles());

        $this->artisan('evidence:prune-unpublished')->assertExitCode(0);
        $this->assertCount(1, $disk->allFiles());
        $attachmentId = $accepted['attachments'][0]['attachment_id'];
        $this->get("/api/v1/chapters/{$this->chapterId}/evidence/{$accepted['evidence_id']}/versions/{$accepted['version_id']}/attachments/{$attachmentId}/content")
            ->assertOk()->assertContent($file[1]);
        $this->uploadPaper($rm, $key, [$file, $file])->assertCreated();
    }

    public function test_evidence_rechecks_record_access_and_object_integrity(): void
    {
        $rm = $this->evidenceDraft();
        $key = (string) Str::uuid();
        $files = [['application/pdf', $this->paperPdf()]];
        $result = $this->asOfficer($this->userId)->uploadPaper($rm, $key, $files)->assertCreated()->json('data');
        $path = "/api/v1/chapters/{$this->chapterId}/evidence/{$result['evidence_id']}";
        $attachmentId = $result['attachments'][0]['attachment_id'];
        $download = "{$path}/versions/{$result['version_id']}/attachments/{$attachmentId}/content";
        $this->get("{$path}?unexpected=1")->assertBadRequest()->assertJsonPath('error.code', 'malformed_request');

        $disk = Storage::disk('evidence');
        $objectPath = $disk->allFiles()[0];
        $disk->put($objectPath, 'Changed object');
        $this->get($path)->assertOk()->assertJsonPath('data.current_version.invalid_reason', 'integrity_failed');
        $this->get($download)->assertServiceUnavailable()->assertJsonPath('error.code', 'evidence_unavailable');
        $disk->delete($objectPath);
        $this->get($path)->assertOk()->assertJsonPath('data.current_version.invalid_reason', 'object_missing');
        $unavailableDisk = Mockery::mock(FilesystemAdapter::class);
        $unavailableDisk->shouldReceive('path')->once()->with('')->andReturn($disk->path('unavailable'));
        Storage::set('evidence', $unavailableDisk);
        $this->get($path)->assertServiceUnavailable()->assertJsonPath('error.code', 'evidence_unavailable');
        Storage::set('evidence', $disk);

        $this->call('GET', $download)->assertUnauthorized()->assertJsonPath('error.code', 'unauthenticated');
        DutyGrant::where('user_id', $this->userId)->where('duty_code', 'RECEIVING')->delete();
        $this->uploadPaper($rm, $key, $files)->assertNotFound()->assertJsonPath('error.code', 'evidence_not_found');
        DutyGrant::where('user_id', $this->userId)->where('duty_code', 'INVENTORY')->update([
            'scope' => json_encode(['unit_id' => (string) Str::uuid()]),
        ]);
        $this->get($download)->assertNotFound()->assertJsonPath('error.code', 'evidence_not_found');

        ChapterMembership::where('user_id', $this->userId)->update(['membership_status' => 'revoked']);
        $this->get($download)->assertNotFound()->assertJsonPath('error.code', 'chapter_not_found');
        $this->uploadPaper($rm, $key, $files)->assertNotFound()->assertJsonPath('error.code', 'chapter_not_found');
    }

    public function test_evidence_download_rechecks_session_expiry_when_sending_bytes(): void
    {
        $rm = $this->evidenceDraft();
        $this->asOfficer($this->userId);
        $paper = $this->paperPdf();
        $data = $this->uploadPaper($rm, (string) Str::uuid(), [['application/pdf', $paper]])->assertCreated()->json('data');
        $prefix = config('app.url')."/api/v1/chapters/{$this->chapterId}/evidence/{$data['evidence_id']}/versions/{$data['version_id']}";
        $attachmentId = $data['attachments'][0]['attachment_id'];
        $request = Request::create("{$prefix}/attachments/{$attachmentId}/content", cookies: $this->prepareCookiesForRequest());
        $kernel = app(Kernel::class);
        $response = $kernel->handle($request);
        $this->assertSame(200, $response->getStatusCode());

        $this->travel(61)->minutes();
        ob_start();
        try {
            $response->send(false);
            $body = ob_get_contents();
        } finally {
            ob_end_clean();
            $this->travelBack();
            $kernel->terminate($request, $response);
        }
        $this->assertSame(401, $response->getStatusCode());
        $this->assertSame('unauthenticated', json_decode($body, true)['error']['code']);
    }

    private function evidenceDraft(): OpeningRm
    {
        Storage::fake('evidence');
        $officer = User::findOrFail($this->userId);
        $officer->dutyGrants()->create(['chapter_id' => $this->chapterId, 'duty_code' => 'RECEIVING']);
        $ipc = OpeningCount::create(['chapter_id' => $this->chapterId, 'created_by' => $officer->id]);

        return OpeningRm::create(['chapter_id' => $this->chapterId, 'ipc_id' => $ipc->id]);
    }

    private function uploadPaper(OpeningRm|StockHold $target, string $key, array $files, ?string $extra = null, bool $finished = true): TestResponse
    {
        $boundary = (string) Str::uuid();
        $part = fn (string $name, string $value, string $headers = '') => "--{$boundary}\r\nContent-Disposition: form-data; name=\"{$name}\"{$headers}\r\n\r\n{$value}\r\n";
        $body = $part('purpose', $target instanceof OpeningRm ? 'opening_receipt' : 'hold_clearance').$part('record_id', $target->id);
        if ($extra !== null) {
            $body .= $part($extra, 'opening_receipt');
        }
        foreach ($files as [$mime, $bytes]) {
            $body .= $part('attachments', $bytes, "; filename=\"scan-{$boundary}\"\r\nContent-Type: {$mime}");
        }

        return $this->call('POST', "/api/v1/chapters/{$this->chapterId}/evidence",
            cookies: $this->prepareCookiesForRequest(),
            server: $this->transformHeadersToServerVars(['X-Action-Key' => $key, 'Accept' => 'application/json'])
                + ['CONTENT_TYPE' => "multipart/form-data; boundary={$boundary}"],
            content: $body.($finished ? "--{$boundary}--\r\n" : ''),
        );
    }

    private function paperPdf(string $catalog = ''): string
    {
        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ([
            "<< /Type /Catalog /Pages 2 0 R{$catalog} >>",
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>',
        ] as $i => $object) {
            $offsets[] = sprintf("%010d 00000 n \n", strlen($pdf));
            $pdf .= ($i + 1)." 0 obj\n{$object}\nendobj\n";
        }
        $xref = strlen($pdf);

        return $pdf."xref\n0 4\n0000000000 65535 f \n".implode('', $offsets)."trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF\n";
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
