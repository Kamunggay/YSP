<?php

namespace Tests\Feature\Stage1A;

use App\Models\ActualIssue;
use App\Models\AuditLog;
use App\Models\BrowserSession;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\EvidenceBinding;
use App\Models\EvidenceBlob;
use App\Models\InternalRf;
use App\Models\OpeningCount;
use App\Models\OpeningRecordHistory;
use App\Models\OpeningRm;
use App\Models\PolicyRecord;
use App\Models\StockHold;
use App\Models\User;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Shared\CanonicalJson;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
            ->assertJsonCount(63, 'data.actions')
            ->assertJsonPath('data.chapter_id', $this->chapterId);
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

        $this->get("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions")
            ->assertOk()->assertJsonCount(2, 'data.versions')
            ->assertJsonPath('data.next_cursor', null);
        $this->get("/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions/{$legacyVersion}/attachments/{$legacyAttachment}/content")
            ->assertOk()->assertContent($rawBytes);

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

    public function test_evidence_replacement_replays_and_keeps_exact_private_history(): void
    {
        $rm = $this->evidenceDraft();
        $pdf = $this->paperPdf();
        $files = [['application/pdf', $pdf]];
        $first = $this->asOfficer($this->userId)->uploadPaper($rm, (string) Str::uuid(), $files)->assertCreated()->json('data');
        $path = "/api/v1/chapters/{$this->chapterId}/evidence/{$first['evidence_id']}";
        $history = "{$path}/versions";
        $key = (string) Str::uuid();
        $replace = fn (string $actionKey, int $expected, string $reason, array $parts) => $this->paperMultipart(
            $history, $actionKey, ['expected_version' => (string) $expected, 'reason' => $reason], $parts,
        );

        $replace($key, 2, 'New scan', $files)->assertConflict()->assertJsonPath('error.code', 'version_conflict');
        $replace($key, 1, ' ', $files)->assertUnprocessable()->assertJsonPath('error.fields.0.pointer', '/reason');
        $replace($key, 1, 'New scan', [...$files, ['application/pdf', 'Invalid']])->assertUnprocessable();
        $this->get($history)->assertOk()->assertJsonCount(1, 'data.versions')->assertJsonPath('data.next_cursor', null);
        $second = $replace($key, 1, 'New scan', [...$files, ...$files])->assertCreated()
            ->assertHeader('X-Action-Replayed', 'false')->assertJsonPath('data.supersedes_version_id', $first['version_id'])
            ->assertJsonPath('data.version', 2)->assertJsonPath('data.replacement_reason', 'New scan')->json('data');
        $cursor = $this->get("{$history}?limit=1")->assertOk()
            ->assertJsonPath('data.versions.0.superseded_by_version_id', $second['version_id'])->json('data.next_cursor');
        $next = "{$history}?limit=1&cursor=".rawurlencode($cursor);
        $this->get($next)->assertOk()->assertJsonPath('data.versions.0.version_id', $second['version_id'])->assertJsonPath('data.next_cursor', null);
        $this->get("{$history}?limit=1&limit=2")->assertBadRequest();
        $oldDownload = "{$history}/{$first['version_id']}/attachments/{$first['attachments'][0]['attachment_id']}/content";
        $this->get($oldDownload)->assertOk()->assertContent($pdf);
        $this->get("{$history}/{$second['version_id']}/attachments/{$first['attachments'][0]['attachment_id']}/content")
            ->assertNotFound()->assertJsonPath('error.code', 'evidence_not_found');

        $another = $this->uploadPaper($rm, (string) Str::uuid(), $files)->assertCreated()->json('data');
        $this->paperMultipart("/api/v1/chapters/{$this->chapterId}/evidence/{$another['evidence_id']}/versions",
            $key, ['expected_version' => '1', 'reason' => 'Different lineage'], $files)
            ->assertCreated()->assertJsonPath('data.evidence_id', $another['evidence_id']);

        $replace((string) Str::uuid(), 2, 'Third scan', $files)->assertCreated();
        $this->get($next)->assertConflict()->assertJsonPath('error.code', 'snapshot_stale');
        $rm->update(['status' => 'POSTED']);
        $replace($key, 1, 'New scan', [...$files, ...$files])->assertCreated()
            ->assertHeader('X-Action-Replayed', 'true')->assertExactJson(['data' => $second]);
        $replace($key, 1, 'Changed reason', [...$files, ...$files])->assertConflict()->assertJsonPath('error.code', 'action_key_conflict');
        $replace((string) Str::uuid(), 3, 'After posting', $files)->assertConflict()->assertJsonPath('error.code', 'target_locked');
        ChapterMembership::where('user_id', $this->userId)->update(['membership_status' => 'revoked']);
        $this->get($oldDownload)->assertNotFound()->assertJsonPath('error.code', 'chapter_not_found');
        $replace($key, 1, 'New scan', [...$files, ...$files])->assertNotFound()->assertJsonPath('error.code', 'chapter_not_found');
    }

    public function test_exact_evidence_binding_rechecks_order_snapshot_supersession_and_bytes(): void
    {
        $rm = $this->evidenceDraft();
        $files = array_fill(0, 2, ['application/pdf', $this->paperPdf()]);
        $published = $this->asOfficer($this->userId)->uploadPaper($rm, (string) Str::uuid(), $files)->assertCreated()->json('data');
        $bytes = $this->byteBinding($published);
        $snapshot = [
            'target' => $published['target'], 'material_version' => 1, 'sha256' => hash('sha256', 'approved material'),
        ];
        $participant = app(CheckEvidenceBindingParticipant::class);
        $match = DB::transaction(fn () => $participant->recordMatch(
            $this->chapterId, $this->userId, $snapshot, $bytes, null, '', now('UTC')->toISOString(), [],
        ));
        $input = [
            'chapter_id' => $this->chapterId, 'actor_id' => $this->userId,
            'snapshot' => $snapshot, 'required_bytes' => $bytes, 'acknowledgment' => $match->match_projection,
        ];
        $check = fn (array $overrides = []) => DB::transaction(fn () => $participant->check($overrides + $input));
        $this->assertSame('ready', $check()['outcome']);
        $this->assertSame(['outcome' => 'missing', 'reason' => 'acknowledgment_missing'], $check(['acknowledgment' => null]));
        $this->assertSame('snapshot_changed', $check(['snapshot' => ['material_version' => 2] + $snapshot])['reason']);
        $this->assertSame('bytes_changed', $check([
            'required_bytes' => ['attachments' => array_reverse($bytes['attachments'])] + $bytes,
        ])['reason']);
        $this->paperMultipart("/api/v1/chapters/{$this->chapterId}/evidence/{$published['evidence_id']}/versions",
            (string) Str::uuid(), ['expected_version' => '1', 'reason' => 'Replacement'], $files)->assertCreated();
        $this->assertSame('invalidated', $match->fresh()->status);
        $this->assertSame('superseded_version', $check()['reason']);
        Storage::disk('evidence')->delete(EvidenceBlob::findOrFail($bytes['attachments'][0]['attachment_id'])->payload_path);
        $this->assertSame(['outcome' => 'invalid', 'reason' => 'object_missing'], $check());
    }

    public function test_hold_clearance_rejects_stale_and_unavailable_paper_and_binds_current_exact_bytes(): void
    {
        Storage::fake('evidence');
        $hold = StockHold::create([
            'chapter_id' => $this->chapterId, 'status' => 'active', 'version' => 1, 'material_version' => 1,
            'reason_code' => 'quality_check', 'reason' => 'Check condition', 'placed_by_user_id' => $this->userId, 'placed_at' => now(),
            'clearance_proposal_json' => [
                'resolution' => 'Inspected and cleared',
                'signatories' => [['user_id' => $this->userId, 'signed_at' => now('UTC')->subMinute()->toISOString()]],
            ],
            'clearance_material_sha256' => hash('sha256', 'approved clearance'), 'clearance_prepared_by_user_id' => $this->userId,
        ]);
        $files = [['application/pdf', $this->paperPdf()]];
        $first = $this->asOfficer($this->userId)->uploadPaper($hold, (string) Str::uuid(), $files)->assertCreated()->json('data');
        $second = $this->paperMultipart("/api/v1/chapters/{$this->chapterId}/evidence/{$first['evidence_id']}/versions",
            (string) Str::uuid(), ['expected_version' => '1', 'reason' => 'Corrected clearance'], $files)->assertCreated()->json('data');
        $clear = fn (array $paper, ?array $snapshot = null) => $this->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds/{$hold->id}/clear", [
            'expected_version' => 1, 'expected_material_version' => 1, 'matches_paper' => true, 'evidence' => $this->byteBinding($paper),
            'expected_snapshot' => $snapshot ?? [
                'target' => $first['target'], 'material_version' => 1, 'sha256' => $hold->clearance_material_sha256,
            ],
        ], ['X-Action-Key' => (string) Str::uuid()]);
        $clear($first)->assertConflict()->assertJsonPath('error.code', 'evidence_mismatch');
        $clear($second, ['target' => $first['target'], 'material_version' => 1, 'sha256' => hash('sha256', 'another material')])
            ->assertConflict()->assertJsonPath('error.code', 'material_version_conflict');
        $blob = EvidenceBlob::findOrFail($second['attachments'][0]['attachment_id']);
        $disk = Storage::disk('evidence');
        $disk->delete($blob->payload_path);
        $clear($second)->assertConflict()->assertJsonPath('error.code', 'evidence_invalid');
        $this->assertSame('active', $hold->fresh()->status);
        $disk->put($blob->payload_path, $files[0][1]);
        $clear($second)->assertOk();
        $binding = EvidenceBinding::findOrFail($hold->fresh()->clearance_evidence_binding_id);
        $this->assertEquals($this->byteBinding($second), $binding->match_projection['bytes']);
    }

    public function test_opening_evidence_match_and_post_use_the_approved_snapshot_and_current_paper(): void
    {
        $rm = $this->evidenceDraft();
        $observer = User::create([
            'public_id' => 'observer@example.invalid', 'name' => 'Observer', 'email' => 'observer@example.invalid',
            'password_hash' => hash('sha256', 'test credential'), 'status' => 'active',
        ]);
        ChapterMembership::create(['id' => (string) Str::uuid(), 'chapter_id' => $this->chapterId, 'user_id' => $observer->id, 'membership_status' => 'active', 'version' => 1]);
        foreach (['INDEPENDENT_REVIEWER', 'CHAPTER_HEAD', 'FINANCE'] as $duty) {
            DutyGrant::create(['id' => (string) Str::uuid(), 'chapter_id' => $this->chapterId, 'user_id' => $observer->id, 'duty_code' => $duty, 'status' => 'active', 'is_alternate' => false, 'valid_from' => now()->subDay(), 'version' => 1]);
        }
        $unit = CatalogueUnit::create(['chapter_id' => $this->chapterId, 'code' => 'PCS', 'name' => 'Pieces', 'quantity_kind' => 'piece', 'quantity_scale' => 0, 'state' => 'active', 'material_version' => 1]);
        $item = CatalogueItem::create(['chapter_id' => $this->chapterId, 'code' => 'SHIRT', 'name' => 'Shirt', 'unit_id' => $unit->id, 'state' => 'active', 'material_version' => 1]);
        $variant = CatalogueVariant::create(['chapter_id' => $this->chapterId, 'item_id' => $item->id, 'sku' => 'SHIRT-M', 'name' => 'Shirt M', 'unit_id' => $unit->id, 'quantity_scale' => 0, 'state' => 'active', 'material_version' => 1]);
        $location = CatalogueLocation::create(['chapter_id' => $this->chapterId, 'code' => 'MAIN', 'name' => 'Main', 'kind' => 'stockroom', 'custodian_id' => $this->userId, 'state' => 'active', 'material_version' => 1]);

        $cutoff = now('UTC')->subMinutes(10)->format('Y-m-d\TH:i:s.u\Z');
        $countedAt = now('UTC')->subMinutes(5)->format('Y-m-d\TH:i:s.u\Z');
        $signedAt = now('UTC')->subMinutes(3)->format('Y-m-d\TH:i:s.u\Z');
        $authorizedAt = now('UTC')->subMinutes(2)->format('Y-m-d\TH:i:s.u\Z');
        $inspectedAt = now('UTC')->subMinute()->format('Y-m-d\TH:i:s.u\Z');

        $policyBindings = [];
        foreach ([
            'ipc_authorization' => ['CHAPTER_HEAD', 'IpcAuthorizationPolicyValue', ['cutoff_at' => $cutoff, 'count_team_ids' => [$this->userId, $observer->id], 'suspension_record_reference' => 'SUSP-1']],
            'reference_series' => ['CHAPTER_HEAD', 'OpeningReferencePolicyValue', ['ipc_prefix' => 'CEB-IPC', 'rm_prefix' => 'CEB-RM', 'minimum_digits' => 6]],
            'valuation_rounding' => ['FINANCE', 'OpeningValuationPolicyValue', ['currency' => 'PHP', 'unit_value_scale' => 2, 'rounding_mode' => 'half_up', 'round_at' => 'accepted_line', 'valuation_basis_reference' => 'VAL-1']],
        ] as $k => [$owner, $schema, $val]) {
            $pid = (string) Str::uuid();
            PolicyRecord::create(['id' => $pid, 'aggregate_id' => $pid, 'chapter_id' => $this->chapterId, 'policy_code' => $k, 'policy_version' => 1, 'rules_json' => $val, 'effective_from' => now()->subHour()]);
            AuditLog::create(['chapter_id' => $this->chapterId, 'user_id' => $observer->id, 'action' => 'controlled:recordPolicy', 'entity_type' => 'policy', 'entity_id' => $pid, 'details' => ['version' => 1, 'subject_id' => null, 'value_schema_reference' => '#/components/schemas/'.$schema, 'value_sha256' => CanonicalJson::sha256($val), 'approvals' => [['authority' => $owner, 'approver_id' => $observer->id]]]]);
            $policyBindings[] = ['setting_key' => $k, 'policy_id' => $pid, 'version' => 1];
        }

        $files = [['application/pdf', $this->paperPdf()]];
        $paper = $this->asOfficer($this->userId)->uploadPaper($rm, (string) Str::uuid(), $files)->assertCreated()->json('data');
        $bytes = $this->byteBinding($paper);
        $lineId = (string) Str::uuid();
        $ipcMaterial = [
            'cutoff_at' => $cutoff, 'informal_movements_suspended' => true,
            'count_team' => [['user_id' => $this->userId, 'regular_custodian' => true], ['user_id' => $observer->id, 'regular_custodian' => false]],
            'policies' => $policyBindings,
            'lines' => [[
                'line_id' => $lineId, 'item_id' => $item->id, 'variant_id' => $variant->id, 'variant_material_version' => 1,
                'unit_id' => $unit->id, 'unit_material_version' => 1, 'quantity_scale' => 0, 'historical_variant_label' => 'Shirt M',
                'location_id' => $location->id, 'location_material_version' => 1, 'regular_custodian_ids' => [$this->userId],
                'condition' => 'usable', 'counted_quantity' => '10', 'unit_value' => '25.00', 'valuation_basis' => 'Cost', 'provenance_reference' => 'S-1',
                'restrictions' => ['state' => 'unrestricted', 'allowed_uses' => ['internal_use'], 'event_ids' => [], 'requesting_unit_ids' => [], 'effective_from' => null, 'effective_until' => null, 'interpretation_id' => null, 'source_condition_reference' => null],
            ]],
            'notes' => null,
        ];
        $counts = [
            ['actor_id' => $this->userId, 'material_version' => 1, 'counted_at' => $countedAt, 'completed' => true, 'signed_at' => $countedAt, 'entries' => [['ipc_line_id' => $lineId, 'quantity' => '10', 'condition' => 'usable', 'notes' => null]]],
            ['actor_id' => $observer->id, 'material_version' => 1, 'counted_at' => $countedAt, 'completed' => true, 'signed_at' => $countedAt, 'entries' => [['ipc_line_id' => $lineId, 'quantity' => '10', 'condition' => 'usable', 'notes' => null]]],
        ];
        $auths = [
            ['id' => (string) Str::uuid(), 'actor_id' => $observer->id, 'duty' => 'CHAPTER_HEAD', 'material_version' => 1, 'authorized_at' => $authorizedAt, 'signed_at' => $signedAt, 'signed_ipc' => $bytes],
            ['id' => (string) Str::uuid(), 'actor_id' => $observer->id, 'duty' => 'FINANCE', 'material_version' => 1, 'authorized_at' => $authorizedAt, 'signed_at' => $signedAt, 'signed_ipc' => $bytes],
        ];
        $rm->ipc->update([
            'status' => 'AUTHORIZED', 'ipc_number' => 'CEB-IPC-2026-000001',
            'material_json' => $ipcMaterial, 'counts_json' => $counts, 'signed_ipc_json' => $bytes, 'authorizations_json' => $auths,
        ]);

        $rmMaterial = [
            'ipc_material_version' => 1,
            'lines' => [['ipc_line_id' => $lineId, 'accepted_quantity' => '10', 'damaged_quantity' => '0', 'rejected_quantity' => '0', 'accepted_value' => '250.00', 'finding_reason' => null]],
            'notes' => null,
        ];
        $material = [
            'chapter_id' => $this->chapterId, 'rm_id' => $rm->id, 'rm_material_version' => 1,
            'ipc_id' => $rm->ipc_id, 'ipc_material_version' => 1, 'ipc_reference' => 'CEB-IPC-2026-000001',
            'material' => $ipcMaterial, 'counts' => $counts, 'signed_ipc' => $bytes, 'authorizations' => $auths,
            'rm_material' => $rmMaterial,
            'inspection' => ['inspector_id' => $this->userId, 'inspected_at' => $inspectedAt, 'material_version' => 1, 'technical_representative_id' => null, 'inspection_notes' => 'Checked'],
        ];
        $rm->update(['status' => 'INSPECTED', 'prepared_by' => $this->userId, 'material_json' => $rmMaterial, 'snapshot_data' => $material, 'snapshot_sha256' => CanonicalJson::sha256($material)]);
        OpeningRecordHistory::create([
            'chapter_id' => $this->chapterId, 'record_type' => 'OPENING_RM', 'record_id' => $rm->id,
            'revision' => 1, 'material_version' => 1, 'event_type' => 'created', 'actor_user_id' => $this->userId,
            'snapshot_json' => $rm->toArray(), 'created_at' => now(),
        ]);

        $path = "/api/v1/chapters/{$this->chapterId}/opening-rms/{$rm->id}";
        $request = [
            'expected_revision' => 1, 'material_version' => 1, 'snapshot_sha256' => CanonicalJson::sha256($material),
            'bytes' => $bytes, 'acknowledged_at' => now('UTC')->toISOString(),
        ];
        $key = (string) Str::uuid();
        $this->postJson("{$path}/evidence-match", ['snapshot_sha256' => hash('sha256', 'wrong paper')] + $request, ['X-Action-Key' => $key])
            ->assertConflict()->assertJsonPath('error.code', 'version_conflict');
        $match = $this->postJson("{$path}/evidence-match", $request, ['X-Action-Key' => $key])
            ->assertOk()->assertHeader('X-Action-Replayed', 'false')->json('data.record.acknowledgment');
        $this->postJson("{$path}/evidence-match", $request, ['X-Action-Key' => $key])
            ->assertOk()->assertHeader('X-Action-Replayed', 'true')->assertJsonPath('data.record.acknowledgment.acknowledgment_id', $match['acknowledgment_id']);

        $post = fn () => $this->postJson("{$path}/post", [
            'expected_revision' => 2, 'material_version' => 1, 'ipc_material_version' => 1,
            'acknowledgment_id' => $match['acknowledgment_id'],
        ], ['X-Action-Key' => (string) Str::uuid()]);
        $blob = EvidenceBlob::findOrFail($paper['attachments'][0]['attachment_id']);
        $disk = Storage::disk('evidence');
        $disk->delete($blob->payload_path);
        $post()->assertConflict()->assertJsonPath('error.code', 'evidence_invalid');
        $disk->put($blob->payload_path, $files[0][1]);

        $this->paperMultipart("/api/v1/chapters/{$this->chapterId}/evidence/{$paper['evidence_id']}/versions",
            (string) Str::uuid(), ['expected_version' => '1', 'reason' => 'Corrected opening paper'], $files)->assertCreated();
        $post()->assertConflict()->assertJsonPath('error.code', 'evidence_mismatch');
        $this->assertSame('EVIDENCE_MATCHED', $rm->fresh()->status);
        $this->assertDatabaseCount('inventory_movements', 0);
    }

    public function test_actual_issue_rechecks_its_exact_acknowledgment_before_posting(): void
    {
        Storage::fake('evidence');
        $recipient = User::create([
            'public_id' => 'recipient@example.invalid', 'name' => 'Recipient', 'email' => 'recipient@example.invalid',
            'password_hash' => hash('sha256', 'test credential'), 'status' => 'active',
        ]);
        $rf = InternalRf::create([
            'chapter_id' => $this->chapterId, 'requester_user_id' => $recipient->id, 'status' => 'approved',
        ]);
        $issue = ActualIssue::create([
            'chapter_id' => $this->chapterId, 'requisition_id' => $rf->id, 'issue_number' => 'IS-1',
            'recipient_user_id' => $recipient->id, 'recipient_name' => $recipient->name, 'prepared_by_user_id' => $this->userId,
            'handed_over_at' => now()->subMinutes(2), 'acknowledged_at' => now()->subMinute(), 'entered_at' => now(),
            'material_json' => ['rf_id' => $rf->id], 'material_sha256' => CanonicalJson::sha256(['rf_id' => $rf->id]),
        ])->refresh();
        $files = [['application/pdf', $this->paperPdf()]];
        $paper = $this->asOfficer($this->userId)->uploadPaper($issue, (string) Str::uuid(), $files)->assertCreated()->json('data');
        $path = "/api/v1/chapters/{$this->chapterId}/actual-issues/{$issue->id}";
        $matchRequest = [
            'expected_version' => 1, 'expected_material_version' => 1, 'expected_snapshot' => $issue->evidenceSnapshot(),
            'evidence' => $this->byteBinding($paper), 'matches_paper' => true,
        ];
        $match = $this->postJson("{$path}/acknowledgments", $matchRequest, ['X-Action-Key' => (string) Str::uuid()])
            ->assertOk()->assertJsonPath('data.result.acknowledgment.recipient_id', $recipient->id)->json('data.result.acknowledgment');
        $this->assertEquals($this->byteBinding($paper), $match['bytes']);

        $post = fn () => $this->postJson("{$path}/post", [
            'expected_version' => 2, 'expected_material_version' => 1, 'acknowledgment_id' => $match['acknowledgment_id'],
        ], ['X-Action-Key' => (string) Str::uuid()]);
        $blob = EvidenceBlob::findOrFail($paper['attachments'][0]['attachment_id']);
        $disk = Storage::disk('evidence');
        $disk->delete($blob->payload_path);
        $post()->assertConflict()->assertJsonPath('error.code', 'evidence_invalid');
        $disk->put($blob->payload_path, $files[0][1]);
        $this->paperMultipart("/api/v1/chapters/{$this->chapterId}/evidence/{$paper['evidence_id']}/versions",
            (string) Str::uuid(), ['expected_version' => '1', 'reason' => 'Corrected issue paper'], $files)->assertCreated();
        $post()->assertConflict()->assertJsonPath('error.code', 'evidence_mismatch');
        $this->assertSame('unresolved', $issue->fresh()->handover_fence);
        $this->assertDatabaseCount('inventory_movements', 0);
    }

    private function byteBinding(array $version): array
    {
        return [
            'evidence_id' => $version['evidence_id'], 'version_id' => $version['version_id'],
            'attachments' => array_map(fn ($file) => ['attachment_id' => $file['attachment_id'], 'sha256' => $file['sha256']], $version['attachments']),
        ];
    }

    private function evidenceDraft(): OpeningRm
    {
        Storage::fake('evidence');
        $officer = User::findOrFail($this->userId);
        $officer->dutyGrants()->create(['chapter_id' => $this->chapterId, 'duty_code' => 'RECEIVING']);
        $ipc = OpeningCount::create(['chapter_id' => $this->chapterId, 'created_by' => $officer->id]);

        return OpeningRm::create(['chapter_id' => $this->chapterId, 'ipc_id' => $ipc->id]);
    }

    private function uploadPaper(OpeningRm|StockHold|ActualIssue $target, string $key, array $files, ?string $extra = null, bool $finished = true): TestResponse
    {
        return $this->paperMultipart("/api/v1/chapters/{$this->chapterId}/evidence", $key, [
            'purpose' => match ($target::class) {
                OpeningRm::class => 'opening_receipt',
                StockHold::class => 'hold_clearance',
                ActualIssue::class => 'actual_issue',
            },
            'record_id' => $target->id,
        ], $files, $extra, $finished);
    }

    private function paperMultipart(string $path, string $key, array $metadata, array $files, ?string $extra = null, bool $finished = true): TestResponse
    {
        $boundary = (string) Str::uuid();
        $part = fn (string $name, string $value, string $headers = '') => "--{$boundary}\r\nContent-Disposition: form-data; name=\"{$name}\"{$headers}\r\n\r\n{$value}\r\n";
        $body = '';
        foreach ($metadata as $name => $value) {
            $body .= $part($name, $value);
        }
        if ($extra !== null) {
            $body .= $part($extra, 'opening_receipt');
        }
        foreach ($files as [$mime, $bytes]) {
            $body .= $part('attachments', $bytes, "; filename=\"scan-{$boundary}\"\r\nContent-Type: {$mime}");
        }

        return $this->call('POST', $path,
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
