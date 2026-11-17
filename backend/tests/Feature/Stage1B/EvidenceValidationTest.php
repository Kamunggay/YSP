<?php

namespace Tests\Feature\Stage1B;

use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use App\Models\User;
use App\Services\Delivery\HandoverCoordinatorService;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use DomainException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class EvidenceValidationTest extends TestCase
{
    use RefreshDatabase;

    private string $chapterId;

    private string $userId;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('evidence');
        Storage::fake('public');

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
            'version' => 1,
        ]);
    }

    /**
     * Test 1: Valid Paper Evidence Upload.
     * Server computes authoritative SHA-256 hash, stores in private disk, returns 201 Created.
     */
    public function test_valid_paper_evidence_upload(): void
    {
        $rawBytes = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
        $expectedSha256 = hash('sha256', $rawBytes);

        $uploadedFile = UploadedFile::fake()->createWithContent('paper_voucher.pdf', $rawBytes);

        $response = $this->withHeaders(['X-User-Id' => $this->userId])
            ->post("/api/v1/chapters/{$this->chapterId}/evidence", [
                'purpose' => 'actual_issue',
                'record_id' => (string) Str::uuid(),
                'attachments' => [$uploadedFile],
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.technical_state', 'ready')
            ->assertJsonPath('data.attachments.0.sha256', $expectedSha256)
            ->assertJsonPath('data.attachments.0.media_type', 'application/pdf');

        $evidenceId = $response->json('data.evidence_id');
        $attachmentId = $response->json('data.attachments.0.attachment_id');

        // Assert record and blob persisted
        $this->assertDatabaseHas('evidence_records', [
            'id' => $evidenceId,
            'chapter_id' => $this->chapterId,
            'technical_state' => 'ready',
        ]);

        $blob = EvidenceBlob::where('id', $attachmentId)->first();
        $this->assertNotNull($blob);
        $this->assertEquals($expectedSha256, $blob->sha256_hash);

        // Verify stored in private disk 'evidence', NOT public
        $this->assertTrue(Storage::disk('evidence')->exists($blob->payload_path));
        $this->assertFalse(Storage::disk('public')->exists($blob->payload_path));
    }

    /**
     * Test 2: MIME & Size Validation.
     * Upload of .exe or .txt disguised as JPEG returns 422.
     * Upload of empty file (0 bytes) returns 422.
     * Upload of file exceeding 10MB returns 422.
     */
    public function test_mime_and_size_validation(): void
    {
        $headers = ['X-User-Id' => $this->userId];
        $recordId = (string) Str::uuid();

        // 1. Upload of .exe disguised as JPEG
        $exeBytes = "MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xFF\xFF\x00\x00".str_repeat('X', 64);
        $disguisedExe = UploadedFile::fake()->createWithContent('voucher.jpg', $exeBytes);

        $responseExe = $this->withHeaders($headers)
            ->post("/api/v1/chapters/{$this->chapterId}/evidence", [
                'purpose' => 'actual_issue',
                'record_id' => $recordId,
                'attachments' => [$disguisedExe],
            ]);

        $responseExe->assertStatus(422)
            ->assertJsonPath('error.code', 'unsupported_media_type');

        // 2. Upload of .txt disguised as PDF
        $txtBytes = 'This is plain text disguised as a PDF file.';
        $disguisedTxt = UploadedFile::fake()->createWithContent('signed_issue.pdf', $txtBytes);

        $responseTxt = $this->withHeaders($headers)
            ->post("/api/v1/chapters/{$this->chapterId}/evidence", [
                'purpose' => 'actual_issue',
                'record_id' => $recordId,
                'attachments' => [$disguisedTxt],
            ]);

        $responseTxt->assertStatus(422)
            ->assertJsonPath('error.code', 'unsupported_media_type');

        // 3. Upload of empty file (0 bytes)
        $emptyFile = UploadedFile::fake()->createWithContent('empty.pdf', '');

        $responseEmpty = $this->withHeaders($headers)
            ->post("/api/v1/chapters/{$this->chapterId}/evidence", [
                'purpose' => 'actual_issue',
                'record_id' => $recordId,
                'attachments' => [$emptyFile],
            ]);

        $responseEmpty->assertStatus(422)
            ->assertJsonPath('error.code', 'file_empty');

        // 4. Upload of file exceeding 10MB (10MB + 1KB)
        $largeBytes = '%PDF-1.4'.str_repeat('A', 10 * 1024 * 1024 + 1024);
        $largeFile = UploadedFile::fake()->createWithContent('oversized.pdf', $largeBytes);

        $responseLarge = $this->withHeaders($headers)
            ->post("/api/v1/chapters/{$this->chapterId}/evidence", [
                'purpose' => 'actual_issue',
                'record_id' => $recordId,
                'attachments' => [$largeFile],
            ]);

        $responseLarge->assertStatus(422)
            ->assertJsonPath('error.code', 'file_too_large');
    }

    /**
     * Test 3: Versioning & Authenticated Retrieval.
     * Upload v1, replace with v2, stream attachment bytes with auth check.
     */
    public function test_versioning_and_authenticated_retrieval(): void
    {
        $headers = ['X-User-Id' => $this->userId];

        // 1. Upload v1
        $v1Bytes = "%PDF-1.4\n1 0 obj\n<< /Title (Version 1) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
        $v1File = UploadedFile::fake()->createWithContent('voucher_v1.pdf', $v1Bytes);

        $uploadResp = $this->withHeaders($headers)
            ->post("/api/v1/chapters/{$this->chapterId}/evidence", [
                'purpose' => 'actual_issue',
                'record_id' => (string) Str::uuid(),
                'attachments' => [$v1File],
            ]);

        $uploadResp->assertStatus(201);
        $evidenceId = $uploadResp->json('data.evidence_id');
        $v1AttachmentId = $uploadResp->json('data.attachments.0.attachment_id');

        // 2. Replace with v2
        $v2Bytes = "%PDF-1.4\n1 0 obj\n<< /Title (Version 2 - Clearer Scan) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
        $v2File = UploadedFile::fake()->createWithContent('voucher_v2.pdf', $v2Bytes);

        $replaceResp = $this->withHeaders($headers)
            ->post("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions", [
                'replacement_reason' => 'Clearer scan attached.',
                'attachments' => [$v2File],
            ]);

        $replaceResp->assertStatus(201)
            ->assertJsonPath('data.version', 2)
            ->assertJsonPath('data.replacement_reason', 'Clearer scan attached.');

        $v2AttachmentId = $replaceResp->json('data.attachments.0.attachment_id');

        // 3. List versions
        $listResp = $this->withHeaders($headers)
            ->getJson("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions");
        $listResp->assertStatus(200)
            ->assertJsonCount(2, 'data');

        // 4. Stream v1 attachment content
        $streamV1 = $this->withHeaders($headers)
            ->get("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions/1/attachments/{$v1AttachmentId}/content");
        $streamV1->assertStatus(200)
            ->assertHeader('Content-Type', 'application/pdf');
        $this->assertEquals($v1Bytes, $streamV1->getContent());

        // 5. Stream v2 attachment content
        $streamV2 = $this->withHeaders($headers)
            ->get("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions/2/attachments/{$v2AttachmentId}/content");
        $streamV2->assertStatus(200)
            ->assertHeader('Content-Type', 'application/pdf');
        $this->assertEquals($v2Bytes, $streamV2->getContent());
    }

    /**
     * Test 4: Evidence Binding & Fingerprint Matching.
     * Binds evidence to batch of 4 shirts for Recipient "John Doe", check returns ready.
     */
    public function test_evidence_binding_and_fingerprint_matching(): void
    {
        $participant = app(CheckEvidenceBindingParticipant::class);

        $evidence = EvidenceRecord::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'technical_state' => 'ready',
            'created_by' => $this->userId,
        ]);

        $lines = [
            [
                'variant_id' => 'VAR-SHIRT-M',
                'unit_id' => 'UNIT-PCS',
                'quantity' => 4,
            ],
        ];

        $binding = $participant->createOrUpdateBinding(
            $this->chapterId,
            $evidence->id,
            (string) Str::uuid(),
            'requisition',
            'RF-2026-001',
            'John Doe',
            $lines
        );

        $this->assertNotNull($binding);
        $this->assertEquals('John Doe', $binding->recipient_name);
        $this->assertEquals('requisition', $binding->source_type);
        $this->assertEquals('RF-2026-001', $binding->source_id);

        // Verification call (strict mode)
        $checkResult = $participant->check([
            'chapter_id' => $this->chapterId,
            'evidence_id' => $evidence->id,
            'source_type' => 'requisition',
            'source_id' => 'RF-2026-001',
            'recipient_name' => 'John Doe',
            'lines' => $lines,
        ], strict: true);

        $this->assertEquals('ready', $checkResult['outcome']);
        $this->assertEquals($binding->id, $checkResult['acknowledgment_id']);
        $this->assertEquals($binding->item_fingerprint, $checkResult['snapshot']['fingerprint']);
    }

    /**
     * Test 5: Changed-Batch Invalidation Invariant.
     * Mutate batch quantity from 4 to 5 units -> CheckEvidenceBindingParticipant throws DomainException.
     * Mutate recipient name -> rejected with mismatch.
     * Integration: HandoverCoordinatorService rejects commit immediately.
     */
    public function test_changed_batch_invalidation_invariant(): void
    {
        $participant = app(CheckEvidenceBindingParticipant::class);

        $evidence = EvidenceRecord::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'technical_state' => 'ready',
            'created_by' => $this->userId,
        ]);

        $originalLines = [
            [
                'variant_id' => 'VAR-SHIRT-M',
                'unit_id' => 'UNIT-PCS',
                'quantity' => 4,
            ],
        ];

        $binding = $participant->createOrUpdateBinding(
            $this->chapterId,
            $evidence->id,
            (string) Str::uuid(),
            'sales_order',
            'SO-2026-001',
            'John Doe',
            $originalLines
        );

        // 1. Mutate quantity from 4 to 5 units in strict mode -> must throw DomainException
        $mutatedQuantityLines = [
            [
                'variant_id' => 'VAR-SHIRT-M',
                'unit_id' => 'UNIT-PCS',
                'quantity' => 5,
            ],
        ];

        $this->expectException(DomainException::class);
        $this->expectExceptionMessage('fingerprint mismatch');

        $participant->check([
            'chapter_id' => $this->chapterId,
            'evidence_id' => $evidence->id,
            'source_type' => 'sales_order',
            'source_id' => 'SO-2026-001',
            'recipient_name' => 'John Doe',
            'lines' => $mutatedQuantityLines,
        ], strict: true);
    }

    /**
     * Test 5b: Mutated recipient mismatch check and non-strict outcome.
     */
    public function test_mutated_recipient_and_non_strict_outcomes(): void
    {
        $participant = app(CheckEvidenceBindingParticipant::class);

        $evidence = EvidenceRecord::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'technical_state' => 'ready',
            'created_by' => $this->userId,
        ]);

        $originalLines = [
            [
                'variant_id' => 'VAR-SHIRT-M',
                'unit_id' => 'UNIT-PCS',
                'quantity' => 4,
            ],
        ];

        $binding = $participant->createOrUpdateBinding(
            $this->chapterId,
            $evidence->id,
            (string) Str::uuid(),
            'sales_order',
            'SO-2026-001',
            'John Doe',
            $originalLines
        );

        // Non-strict quantity mutation -> outcome mismatched with reason snapshot_changed
        $mutatedQuantityLines = [
            [
                'variant_id' => 'VAR-SHIRT-M',
                'unit_id' => 'UNIT-PCS',
                'quantity' => 5,
            ],
        ];

        $resultQty = $participant->check([
            'chapter_id' => $this->chapterId,
            'evidence_id' => $evidence->id,
            'source_type' => 'sales_order',
            'source_id' => 'SO-2026-001',
            'recipient_name' => 'John Doe',
            'lines' => $mutatedQuantityLines,
        ], strict: false);

        $this->assertEquals('mismatched', $resultQty['outcome']);
        $this->assertEquals('snapshot_changed', $resultQty['reason']);

        // Non-strict recipient mutation -> outcome mismatched with reason target_mismatch
        $resultRecipient = $participant->check([
            'chapter_id' => $this->chapterId,
            'evidence_id' => $evidence->id,
            'source_type' => 'sales_order',
            'source_id' => 'SO-2026-001',
            'recipient_name' => 'Jane Doe',
            'lines' => $originalLines,
        ], strict: false);

        $this->assertEquals('mismatched', $resultRecipient['outcome']);
        $this->assertEquals('target_mismatch', $resultRecipient['reason']);

        // Integration with Handover endpoint: commit with mutated quantity returns 422 EVIDENCE_MISMATCH
        $handoverPayload = [
            'source' => [
                'kind' => 'sales_order',
                'id' => 'SO-2026-001',
            ],
            'lines' => [
                [
                    'source_line_id' => 'SL-01',
                    'variant_id' => 'VAR-SHIRT-M',
                    'unit_id' => 'UNIT-PCS',
                    'actual_quantity' => 5, // Mutated from 4 to 5!
                ],
            ],
            'recipient_name' => 'John Doe',
            'evidence_id' => $evidence->id,
            'acknowledgment_binding_id' => $binding->id,
        ];

        $resp = $this->withHeaders([
            'Idempotency-Key' => 'KEY-MUTATED-001',
            'X-Chapter-Id' => $this->chapterId,
            'X-User-Id' => $this->userId,
        ])->postJson('/api/v1/handovers', $handoverPayload);

        $resp->assertStatus(422)
            ->assertJsonPath('error', 'EVIDENCE_MISMATCH')
            ->assertJsonPath('code', 'evidence_binding_invalid');
    }

    /**
     * Test 6: Private Storage Security.
     * Files not accessible publicly, unauthenticated GET denied with 401/403.
     */
    public function test_private_storage_security(): void
    {
        $rawBytes = "%PDF-1.4\n1 0 obj\n<< /Title (Secure Attachment) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
        $uploadedFile = UploadedFile::fake()->createWithContent('secure_doc.pdf', $rawBytes);

        $uploadResp = $this->withHeaders(['X-User-Id' => $this->userId])
            ->post("/api/v1/chapters/{$this->chapterId}/evidence", [
                'purpose' => 'actual_issue',
                'record_id' => (string) Str::uuid(),
                'attachments' => [$uploadedFile],
            ]);

        $uploadResp->assertStatus(201);
        $evidenceId = $uploadResp->json('data.evidence_id');
        $attachmentId = $uploadResp->json('data.attachments.0.attachment_id');

        $blob = EvidenceBlob::where('id', $attachmentId)->first();
        $this->assertNotNull($blob);

        // 1. Storage verification: stored in private disk 'evidence', absent from 'public'
        $this->assertTrue(Storage::disk('evidence')->exists($blob->payload_path));
        $this->assertFalse(Storage::disk('public')->exists($blob->payload_path));

        // 2. Unauthenticated GET denied with 401
        $this->flushHeaders();
        $unauthenticatedResp = $this->getJson(
            "/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions/1/attachments/{$attachmentId}/content"
        );
        $unauthenticatedResp->assertStatus(401)
            ->assertJsonPath('error', 'AUTHENTICATION_REQUIRED');
    }

    /**
     * Test 7: Multitenancy & Chapter Isolation.
     * Cross-chapter access returns 404/403.
     */
    public function test_multitenancy_and_chapter_isolation(): void
    {
        // Chapter B and User B
        $chapterBId = (string) Str::uuid();
        $userBId = (string) Str::uuid();

        Chapter::create([
            'id' => $chapterBId,
            'code' => 'SYN-DAVAO',
            'name' => 'Davao Chapter',
            'status' => 'live',
            'version' => 1,
        ]);

        User::create([
            'id' => $userBId,
            'public_id' => 'davao-officer@example.invalid',
            'name' => 'Davao Officer',
            'email' => 'davao-officer@example.invalid',
            'password_hash' => hash('sha256', 'Password123!'),
            'status' => 'active',
            'version' => 1,
        ]);

        ChapterMembership::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapterBId,
            'user_id' => $userBId,
            'membership_status' => 'active',
            'version' => 1,
        ]);

        // Upload evidence in Chapter A by User A
        $rawBytes = "%PDF-1.4\n1 0 obj\n<< /Title (Chapter A Paper) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";
        $uploadedFile = UploadedFile::fake()->createWithContent('chap_a.pdf', $rawBytes);

        $uploadResp = $this->withHeaders(['X-User-Id' => $this->userId])
            ->post("/api/v1/chapters/{$this->chapterId}/evidence", [
                'purpose' => 'actual_issue',
                'record_id' => (string) Str::uuid(),
                'attachments' => [$uploadedFile],
            ]);

        $uploadResp->assertStatus(201);
        $chapterAEvidenceId = $uploadResp->json('data.evidence_id');
        $chapterAAttachmentId = $uploadResp->json('data.attachments.0.attachment_id');

        // 1. User B (member of Chapter B) querying Chapter A's evidence under Chapter B route -> returns 404
        $crossChapterResp = $this->withHeaders(['X-User-Id' => $userBId])
            ->getJson("/api/v1/chapters/{$chapterBId}/evidence/{$chapterAEvidenceId}");
        $crossChapterResp->assertStatus(404);

        // 2. User B trying to access attachment content of Chapter A's evidence under Chapter B route -> returns 404
        $crossContentResp = $this->withHeaders(['X-User-Id' => $userBId])
            ->get("/api/v1/chapters/{$chapterBId}/evidence/{$chapterAEvidenceId}/versions/1/attachments/{$chapterAAttachmentId}/content");
        $crossContentResp->assertStatus(404);

        // 3. User B attempting to access Chapter A route directly -> returns 403 MEMBERSHIP_REQUIRED
        $foreignAccessResp = $this->withHeaders(['X-User-Id' => $userBId])
            ->getJson("/api/v1/chapters/{$this->chapterId}/evidence/{$chapterAEvidenceId}");
        $foreignAccessResp->assertStatus(403)
            ->assertJsonPath('error', 'MEMBERSHIP_REQUIRED');
    }
}
