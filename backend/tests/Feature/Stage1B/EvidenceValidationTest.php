<?php

namespace Tests\Feature\Stage1B;

use App\Models\ActualIssue;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use App\Models\InternalRf;
use App\Models\User;
use App\Services\Delivery\HandoverCoordinatorService;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use DomainException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\TestCase;

class EvidenceValidationTest extends TestCase
{
    use AuthenticatesBrowserOfficer;
    use RefreshDatabase;

    private string $chapterId;

    private string $userId;

    private string $issueId;

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

        foreach (['INVENTORY_CUSTODIAN', 'INVENTORY', 'DISPATCH'] as $duty) {
            DutyGrant::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $this->chapterId,
                'user_id' => $this->userId,
                'duty_code' => $duty,
                'status' => 'active',
                'valid_from' => now()->subDay(),
                'version' => 1,
            ]);
        }

        $rfId = (string) Str::uuid();
        InternalRf::create([
            'id' => $rfId,
            'chapter_id' => $this->chapterId,
            'rf_number' => 'SYN-RF-EVID01',
            'status' => 'approved',
            'purpose' => 'internal_use',
            'requester_user_id' => $this->userId,
            'version' => 1,
            'material_version' => 1,
            'progress_version' => 1,
        ]);

        $this->issueId = (string) Str::uuid();
        ActualIssue::create([
            'id' => $this->issueId,
            'chapter_id' => $this->chapterId,
            'requisition_id' => $rfId,
            'issue_number' => 'SYN-ISAR-EVID01',
            'status' => 'prepared',
            'version' => 1,
            'material_version' => 1,
            'recipient_name' => 'Test Recipient',
            'prepared_by_user_id' => $this->userId,
        ]);
    }

    /**
     * Test 1: Valid Paper Evidence Upload.
     * Server computes authoritative SHA-256 hash, stores in private disk, returns 201 Created.
     */
    public function test_valid_paper_evidence_upload(): void
    {
        $rawBytes = $this->validPaperPdf('Paper Voucher');
        $expectedSha256 = hash('sha256', $rawBytes);

        $response = $this->sendRawMultipartPaper(
            "/api/v1/chapters/{$this->chapterId}/evidence",
            $this->userId,
            (string) Str::uuid(),
            ['purpose' => 'actual_issue', 'record_id' => $this->issueId],
            [['filename' => 'paper_voucher.pdf', 'media_type' => 'application/pdf', 'bytes' => $rawBytes]],
        );

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
     * Disguised .exe/.txt return 422 content_mismatch; empty returns 422 empty_file; >10MiB returns 413 evidence_too_large.
     */
    public function test_mime_and_size_validation(): void
    {
        $fields = ['purpose' => 'actual_issue', 'record_id' => $this->issueId];
        $uri = "/api/v1/chapters/{$this->chapterId}/evidence";

        // 1. Upload of .exe disguised as JPEG
        $exeBytes = "MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xFF\xFF\x00\x00".str_repeat('X', 64);
        $this->sendRawMultipartPaper($uri, $this->userId, (string) Str::uuid(), $fields, [
            ['filename' => 'voucher.jpg', 'media_type' => 'image/jpeg', 'bytes' => $exeBytes],
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'invalid_evidence')
            ->assertJsonPath('error.fields.0.code', 'content_mismatch');

        // 2. Upload of .txt disguised as PDF
        $txtBytes = 'This is plain text disguised as a PDF file.';
        $this->sendRawMultipartPaper($uri, $this->userId, (string) Str::uuid(), $fields, [
            ['filename' => 'signed_issue.pdf', 'media_type' => 'application/pdf', 'bytes' => $txtBytes],
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'invalid_evidence')
            ->assertJsonPath('error.fields.0.code', 'content_mismatch');

        // 3. Upload of empty file (0 bytes)
        $this->sendRawMultipartPaper($uri, $this->userId, (string) Str::uuid(), $fields, [
            ['filename' => 'empty.pdf', 'media_type' => 'application/pdf', 'bytes' => ''],
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'invalid_evidence')
            ->assertJsonPath('error.fields.0.code', 'empty_file');

        // 4. Upload of file exceeding 10MiB -> 413 evidence_too_large
        $largeBytes = '%PDF-1.4'.str_repeat('A', 10 * 1024 * 1024 + 1024);
        $this->sendRawMultipartPaper($uri, $this->userId, (string) Str::uuid(), $fields, [
            ['filename' => 'oversized.pdf', 'media_type' => 'application/pdf', 'bytes' => $largeBytes],
        ])->assertStatus(413)
            ->assertJsonPath('error.code', 'evidence_too_large');
    }

    /**
     * Test 3: Versioning & Authenticated Retrieval.
     * Upload v1, replace with v2, stream attachment bytes with auth check.
     */
    public function test_versioning_and_authenticated_retrieval(): void
    {
        // 1. Upload v1
        $v1Bytes = $this->validPaperPdf('Version 1');
        $uploadResp = $this->sendRawMultipartPaper(
            "/api/v1/chapters/{$this->chapterId}/evidence",
            $this->userId,
            (string) Str::uuid(),
            ['purpose' => 'actual_issue', 'record_id' => $this->issueId],
            [['filename' => 'voucher_v1.pdf', 'media_type' => 'application/pdf', 'bytes' => $v1Bytes]],
        );

        $uploadResp->assertStatus(201);
        $evidenceId = $uploadResp->json('data.evidence_id');
        $v1VersionId = $uploadResp->json('data.version_id');
        $v1AttachmentId = $uploadResp->json('data.attachments.0.attachment_id');

        // 2. Replace with v2
        $v2Bytes = $this->validPaperPdf('Version 2 - Clearer Scan');
        $replaceResp = $this->sendRawMultipartPaper(
            "/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions",
            $this->userId,
            (string) Str::uuid(),
            ['expected_version' => '1', 'reason' => 'Clearer scan attached.'],
            [['filename' => 'voucher_v2.pdf', 'media_type' => 'application/pdf', 'bytes' => $v2Bytes]],
        );

        $replaceResp->assertStatus(201)
            ->assertJsonPath('data.version', 2)
            ->assertJsonPath('data.replacement_reason', 'Clearer scan attached.');

        $v2VersionId = $replaceResp->json('data.version_id');
        $v2AttachmentId = $replaceResp->json('data.attachments.0.attachment_id');

        // 3. List versions
        $listResp = $this->asBrowserOfficer($this->userId)
            ->get("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions");
        $listResp->assertStatus(200)
            ->assertJsonCount(2, 'data.versions');

        // 4. Stream v1 attachment content
        $streamV1 = $this->asBrowserOfficer($this->userId)
            ->get("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions/{$v1VersionId}/attachments/{$v1AttachmentId}/content");
        $streamV1->assertStatus(200)
            ->assertHeader('Content-Type', 'application/pdf');
        $this->assertEquals($v1Bytes, $streamV1->getContent());

        // 5. Stream v2 attachment content
        $streamV2 = $this->asBrowserOfficer($this->userId)
            ->get("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions/{$v2VersionId}/attachments/{$v2AttachmentId}/content");
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
        $rawBytes = $this->validPaperPdf('Secure Attachment');
        $uploadResp = $this->sendRawMultipartPaper(
            "/api/v1/chapters/{$this->chapterId}/evidence",
            $this->userId,
            (string) Str::uuid(),
            ['purpose' => 'actual_issue', 'record_id' => $this->issueId],
            [['filename' => 'secure_doc.pdf', 'media_type' => 'application/pdf', 'bytes' => $rawBytes]],
        );

        $uploadResp->assertStatus(201);
        $evidenceId = $uploadResp->json('data.evidence_id');
        $versionId = $uploadResp->json('data.version_id');
        $attachmentId = $uploadResp->json('data.attachments.0.attachment_id');

        $blob = EvidenceBlob::where('id', $attachmentId)->first();
        $this->assertNotNull($blob);

        // 1. Storage verification: stored in private disk 'evidence', absent from 'public'
        $this->assertTrue(Storage::disk('evidence')->exists($blob->payload_path));
        $this->assertFalse(Storage::disk('public')->exists($blob->payload_path));

        // 2. Unauthenticated GET denied with 401
        $unauthenticatedResp = $this->asGuest()->get(
            "/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions/{$versionId}/attachments/{$attachmentId}/content",
            ['Accept' => 'application/json']
        );
        $unauthenticatedResp->assertStatus(401)
            ->assertJsonPath('error.code', 'unauthenticated');
    }

    /**
     * Test 7: Multitenancy & Chapter Isolation.
     * Cross-chapter access returns 404.
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

        DutyGrant::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapterBId,
            'user_id' => $userBId,
            'duty_code' => 'INVENTORY',
            'status' => 'active',
            'valid_from' => now()->subDay(),
            'version' => 1,
        ]);

        // Upload evidence in Chapter A by User A
        $rawBytes = $this->validPaperPdf('Chapter A Paper');
        $uploadResp = $this->sendRawMultipartPaper(
            "/api/v1/chapters/{$this->chapterId}/evidence",
            $this->userId,
            (string) Str::uuid(),
            ['purpose' => 'actual_issue', 'record_id' => $this->issueId],
            [['filename' => 'chap_a.pdf', 'media_type' => 'application/pdf', 'bytes' => $rawBytes]],
        );

        $uploadResp->assertStatus(201);
        $chapterAEvidenceId = $uploadResp->json('data.evidence_id');
        $chapterAVersionId = $uploadResp->json('data.version_id');
        $chapterAAttachmentId = $uploadResp->json('data.attachments.0.attachment_id');

        // 1. User B (member of Chapter B) querying Chapter A's evidence under Chapter B route -> returns 404
        $this->asBrowserOfficer($userBId)
            ->get("/api/v1/chapters/{$chapterBId}/evidence/{$chapterAEvidenceId}")
            ->assertStatus(404);

        // 2. User B trying to access attachment content of Chapter A's evidence under Chapter B route -> returns 404
        $this->asBrowserOfficer($userBId)
            ->get("/api/v1/chapters/{$chapterBId}/evidence/{$chapterAEvidenceId}/versions/{$chapterAVersionId}/attachments/{$chapterAAttachmentId}/content")
            ->assertStatus(404);

        // 3. User B attempting to access Chapter A route directly (no membership in Chapter A) -> returns 404 chapter_not_found
        $this->asBrowserOfficer($userBId)
            ->get("/api/v1/chapters/{$this->chapterId}/evidence/{$chapterAEvidenceId}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'chapter_not_found');
    }
}
