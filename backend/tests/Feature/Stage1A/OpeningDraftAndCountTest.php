<?php

namespace Tests\Feature\Stage1A;

use App\Models\AuditLog;
use App\Models\BrowserSession;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\InventoryPosting;
use App\Models\OpeningCount;
use App\Models\OpeningRm;
use App\Models\PolicyRecord;
use App\Models\User;
use App\Services\Inventory\OpeningDraftService;
use App\Services\Shared\CanonicalJson;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class OpeningDraftAndCountTest extends TestCase
{
    use RefreshDatabase;

    private string $origin = 'https://opening.example.invalid';

    private string $chapterId;

    private string $foreignChapterId;

    private string $custodianId;

    private string $observerId;

    private string $outsiderCounterId;

    private string $headId;

    private string $unitId;

    private string $itemId;

    private string $variantId;

    private string $locationId;

    private string $cutoffAt = '2026-11-01T00:00:00.000000Z';

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('evidence');

        $this->chapterId = (string) Str::uuid();
        $this->foreignChapterId = (string) Str::uuid();
        $this->custodianId = (string) Str::uuid();
        $this->observerId = (string) Str::uuid();
        $this->outsiderCounterId = (string) Str::uuid();
        $this->headId = (string) Str::uuid();

        Chapter::create(['id' => $this->chapterId, 'code' => 'SYN-CEB', 'name' => 'Cebu Chapter', 'status' => 'live', 'version' => 1]);
        Chapter::create(['id' => $this->foreignChapterId, 'code' => 'SYN-DVO', 'name' => 'Davao Chapter', 'status' => 'live', 'version' => 1]);

        foreach ([
            [$this->custodianId, 'custodian@example.invalid', 'Custodian A', ['INVENTORY']],
            [$this->observerId, 'observer@example.invalid', 'Observer B', ['INDEPENDENT_REVIEWER', 'RECEIVING']],
            [$this->outsiderCounterId, 'outsider@example.invalid', 'Outsider C', ['INDEPENDENT_REVIEWER']],
            [$this->headId, 'head@example.invalid', 'Chapter Head', ['CHAPTER_HEAD']],
        ] as [$uid, $email, $name, $duties]) {
            User::create([
                'id' => $uid,
                'public_id' => $email,
                'name' => $name,
                'email' => $email,
                'password_hash' => hash('sha256', 'Password123!'),
                'status' => 'active',
                'version' => 1,
            ]);
            ChapterMembership::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $this->chapterId,
                'user_id' => $uid,
                'membership_status' => 'active',
                'version' => 1,
            ]);
            foreach ($duties as $duty) {
                DutyGrant::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $this->chapterId,
                    'user_id' => $uid,
                    'duty_code' => $duty,
                    'status' => 'active',
                    'is_alternate' => false,
                    'valid_from' => now()->subDay(),
                    'version' => 1,
                ]);
            }
        }

        $this->unitId = (string) Str::uuid();
        CatalogueUnit::create([
            'id' => $this->unitId, 'chapter_id' => $this->chapterId, 'code' => 'PCS', 'name' => 'Pieces',
            'quantity_kind' => 'piece', 'quantity_scale' => 0, 'state' => 'active', 'material_version' => 1,
        ]);

        $this->itemId = (string) Str::uuid();
        CatalogueItem::create([
            'id' => $this->itemId, 'chapter_id' => $this->chapterId, 'code' => 'SHIRT', 'name' => 'Shirt',
            'unit_id' => $this->unitId, 'state' => 'active', 'material_version' => 1,
        ]);

        $this->variantId = (string) Str::uuid();
        CatalogueVariant::create([
            'id' => $this->variantId, 'chapter_id' => $this->chapterId, 'item_id' => $this->itemId,
            'sku' => 'SHIRT-M', 'name' => 'Example shirt / M', 'unit_id' => $this->unitId,
            'quantity_scale' => 0, 'state' => 'active', 'material_version' => 1,
        ]);

        $this->locationId = (string) Str::uuid();
        CatalogueLocation::create([
            'id' => $this->locationId, 'chapter_id' => $this->chapterId, 'code' => 'MAIN', 'name' => 'Main Stockroom',
            'kind' => 'stockroom', 'custodian_id' => $this->custodianId, 'state' => 'active', 'material_version' => 1,
        ]);
    }

    public function test_incomplete_ipc_draft_preserves_input_replays_and_surfaces_setup_blockers(): void
    {
        $key = (string) Str::uuid();
        $body = ['material' => $this->emptyIpcMaterial()];

        $created = $this->asOfficer($this->custodianId, $key)
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs", $body);

        $created->assertStatus(201)
            ->assertHeader('X-Action-Replayed', 'false')
            ->assertHeader('Cache-Control', 'no-store')
            ->assertJsonPath('data.operation.operation', 'createIpc')
            ->assertJsonPath('data.operation.http_status', 201)
            ->assertJsonPath('data.record.reference', null)
            ->assertJsonPath('data.record.revision', 1)
            ->assertJsonPath('data.record.material_version', 1)
            ->assertJsonPath('data.record.state', 'draft')
            ->assertJsonPath('data.record.prepared_by', $this->custodianId)
            ->assertJsonPath('data.record.material.cutoff_at', null)
            ->assertJsonPath('data.record.material.lines', [])
            ->assertJsonPath('data.posting', null);

        $ipcId = $created->json('data.record.id');

        // Exact same-key replay returns original receipt with X-Action-Replayed: true
        $replay = $this->asOfficer($this->custodianId, $key)
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs", $body);
        $replay->assertStatus(201)
            ->assertHeader('X-Action-Replayed', 'true')
            ->assertJsonPath('data.operation.id', $created->json('data.operation.id'))
            ->assertJsonPath('data.record.id', $ipcId);
        $this->assertSame(1, OpeningCount::where('chapter_id', $this->chapterId)->count());

        // Different payload with same action key conflicts
        $conflict = $this->asOfficer($this->custodianId, $key)
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs", [
                'material' => array_replace($this->emptyIpcMaterial(), ['notes' => 'Changed note']),
            ]);
        $conflict->assertStatus(409)->assertJsonPath('error.code', 'action_key_conflict');

        // Chapter access keeps ipc.draft allowed while surfacing missing setup blockers for opening_rm.post
        $access = $this->asOfficer($this->observerId)->get("/api/v1/chapters/{$this->chapterId}/access");
        $access->assertOk();
        $postAction = collect($access->json('data.actions'))->firstWhere('action', 'opening_rm.post');
        $this->assertSame('setup_blocked', $postAction['state']);
        $this->assertSame(['reference_series', 'valuation_rounding'], array_column($postAction['blockers'], 'setting_key'));

        // Pinning a missing or unapproved policy returns 428 setup_blocked with named blockers
        $blocked = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}", [
                'expected_revision' => 1,
                'reason' => 'Pin missing policy',
                'material' => array_replace($this->emptyIpcMaterial(), [
                    'policies' => [[
                        'setting_key' => 'valuation_rounding',
                        'policy_id' => (string) Str::uuid(),
                        'version' => 1,
                    ]],
                ]),
            ]);
        $blocked->assertStatus(428)
            ->assertJsonPath('error.code', 'setup_blocked')
            ->assertJsonPath('error.blockers.0.setting_key', 'valuation_rounding')
            ->assertJsonPath('error.blockers.0.approval_owner', 'FINANCE')
            ->assertJsonPath('error.blockers.0.state', 'missing');

        // No physical stock or references created
        $this->assertSame(0, InventoryPosting::count());
        $this->assertSame(0, InventoryMovement::count());
        $this->assertSame(0, InventoryLot::count());
    }

    public function test_independent_counts_custody_disagreement_stale_version_and_history(): void
    {
        $policies = $this->seedEffectivePolicies();
        $line1 = (string) Str::uuid();
        $line2 = (string) Str::uuid();

        // 1. Create empty IPC draft
        $ipcId = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs", ['material' => $this->emptyIpcMaterial()])
            ->assertStatus(201)
            ->json('data.record.id');

        // 2. Omitting location's recorded custodian is rejected
        $missingCustodianLine = $this->makeLine($line1, 'usable', '12', [$this->observerId]);
        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}", [
                'expected_revision' => 1,
                'reason' => 'Omit custodian',
                'material' => $this->completeMaterial($policies, [$missingCustodianLine]),
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'invalid_source');

        // 3. Replace with complete material (even if caller attempts to spoof regular_custodian=false for custodian)
        $completeMaterial = $this->completeMaterial($policies, [
            $this->makeLine($line1, 'usable', '12', [$this->custodianId]),
            $this->makeLine($line2, 'damaged', '2', [$this->custodianId]),
        ], spoofCustodianFalse: true);

        $replaced = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}", [
                'expected_revision' => 1,
                'reason' => 'Populate count sheet',
                'material' => $completeMaterial,
            ]);

        $replaced->assertOk()
            ->assertJsonPath('data.record.revision', 2)
            ->assertJsonPath('data.record.material_version', 2)
            ->assertJsonPath('data.record.reference', null);

        // Recorded custody governs: custodian's regular_custodian flag cannot be spoofed to false
        $teamByUser = collect($replaced->json('data.record.material.count_team'))->keyBy('user_id');
        $this->assertTrue($teamByUser[$this->custodianId]['regular_custodian']);
        $this->assertFalse($teamByUser[$this->observerId]['regular_custodian']);

        // 4. Stale expected_revision returns 409 version_conflict
        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}", [
                'expected_revision' => 1,
                'reason' => 'Stale write',
                'material' => $completeMaterial,
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'version_conflict');

        // 5. Non-team observer with ipc.count duty is denied
        $this->asOfficer($this->outsiderCounterId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 2,
                'material_version' => 2,
                'counted_at' => null,
                'completed' => false,
                'signed_at' => null,
                'entries' => [],
            ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'duty_denied');

        // 6. Incremental incomplete count saves cleanly
        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 2,
                'material_version' => 2,
                'counted_at' => null,
                'completed' => false,
                'signed_at' => null,
                'entries' => [['ipc_line_id' => $line1, 'quantity' => null, 'condition' => null, 'notes' => 'In progress']],
            ])
            ->assertOk()
            ->assertJsonPath('data.record.revision', 3)
            ->assertJsonPath('data.record.material_version', 2);

        // 7. Completed count missing a line fails 409 source_incomplete
        $countTime = now('UTC')->subMinutes(5)->format('Y-m-d\TH:i:s.u\Z');
        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 3,
                'material_version' => 2,
                'counted_at' => $countTime,
                'completed' => true,
                'signed_at' => $countTime,
                'entries' => [['ipc_line_id' => $line1, 'quantity' => '12', 'condition' => 'usable', 'notes' => null]],
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'source_incomplete');

        // 8. Custodian completes full count (attributed strictly to authenticated user)
        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 3,
                'material_version' => 2,
                'counted_at' => $countTime,
                'completed' => true,
                'signed_at' => $countTime,
                'entries' => [
                    ['ipc_line_id' => $line1, 'quantity' => '12', 'condition' => 'usable', 'notes' => null],
                    ['ipc_line_id' => $line2, 'quantity' => '2', 'condition' => 'damaged', 'notes' => null],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.record.revision', 4);

        // Only custodian counted so far -> independence is still missing
        $service = app(OpeningDraftService::class);
        $this->assertFalse($service->hasIndependentCompletedCounts(OpeningCount::findOrFail($ipcId)));

        // 9. Independent observer (INDEPENDENT_REVIEWER, no INVENTORY duty) records disagreeing count
        // Disagreement remains visible; custodian's entries are preserved untouched
        $disagreeRes = $this->asOfficer($this->observerId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 4,
                'material_version' => 2,
                'counted_at' => $countTime,
                'completed' => true,
                'signed_at' => $countTime,
                'entries' => [
                    ['ipc_line_id' => $line1, 'quantity' => '11', 'condition' => 'usable', 'notes' => 'Observed 11'],
                    ['ipc_line_id' => $line2, 'quantity' => '2', 'condition' => 'damaged', 'notes' => null],
                ],
            ]);
        $disagreeRes->assertOk()->assertJsonPath('data.record.revision', 5);
        $this->assertCount(2, $disagreeRes->json('data.record.counts'));
        $byActor = collect($disagreeRes->json('data.record.counts'))->keyBy('actor_id');
        $custEntry = collect($byActor[$this->custodianId]['entries'])->firstWhere('ipc_line_id', $line1);
        $obsEntry = collect($byActor[$this->observerId]['entries'])->firstWhere('ipc_line_id', $line1);
        $this->assertSame('12', $custEntry['quantity']);
        $this->assertSame('11', $obsEntry['quantity']);
        $this->assertTrue($service->hasIndependentCompletedCounts(OpeningCount::findOrFail($ipcId)));

        // 10. History retains every revision and /versions/1 preserves original empty snapshot
        $history = $this->asOfficer($this->custodianId)->get("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/history");
        $history->assertOk()->assertJsonCount(5, 'data');
        $this->assertSame('createIpc', $history->json('data.0.operation.operation'));
        $this->assertSame('Populate count sheet', $history->json('data.1.reason'));

        $rev1 = $this->asOfficer($this->custodianId)->get("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/versions/1");
        $rev1->assertOk()
            ->assertJsonPath('data.revision', 1)
            ->assertJsonPath('data.material_version', 1)
            ->assertJsonPath('data.material.lines', []);

        // 11. Stale material_version on saveMyIpcCount -> 409 snapshot_stale
        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 5,
                'material_version' => 1,
                'counted_at' => $countTime,
                'completed' => true,
                'signed_at' => $countTime,
                'entries' => [
                    ['ipc_line_id' => $line1, 'quantity' => '12', 'condition' => 'usable', 'notes' => null],
                    ['ipc_line_id' => $line2, 'quantity' => '2', 'condition' => 'damaged', 'notes' => null],
                ],
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'snapshot_stale');
    }

    public function test_opening_rm_draft_evidence_target_material_invalidation_and_print(): void
    {
        $policies = $this->seedEffectivePolicies();
        $line1 = (string) Str::uuid();

        // 1. Create empty IPC draft (v1)
        $ipcId = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs", ['material' => $this->emptyIpcMaterial()])
            ->assertStatus(201)
            ->json('data.record.id');

        // 2. Create Opening RM draft early against the incomplete IPC draft
        $rmRes = $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms", [
                'ipc_id' => $ipcId,
                'material' => ['ipc_material_version' => 1, 'lines' => [], 'notes' => null],
            ]);
        $rmRes->assertStatus(201)
            ->assertHeader('X-Action-Replayed', 'false')
            ->assertJsonPath('data.operation.operation', 'createOpeningRm')
            ->assertJsonPath('data.record.ipc_id', $ipcId)
            ->assertJsonPath('data.record.state', 'draft')
            ->assertJsonPath('data.record.reference', null)
            ->assertJsonPath('data.record.prepared_by', $this->observerId);

        $rmId = $rmRes->json('data.record.id');

        // 3. Linked Opening RM draft works as a real authorized target for the private paper evidence workflow
        $evRes = $this->uploadPaper($this->observerId, $rmId, (string) Str::uuid());
        $evRes->assertStatus(201)
            ->assertJsonPath('data.target.purpose', 'opening_receipt')
            ->assertJsonPath('data.target.record_id', $rmId);
        $evidenceId = $evRes->json('data.evidence_id');

        // Related read exposes evidence to evidence.read holder (observer has RECEIVING -> evidence.read)
        // and hides evidence from CHAPTER_HEAD who lacks evidence.read
        $relatedObs = $this->asOfficer($this->observerId)->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/related");
        $relatedObs->assertOk()
            ->assertJsonPath('data.ipc_id', $ipcId)
            ->assertJsonPath('data.rm_ids.0', $rmId)
            ->assertJsonPath('data.evidence.0.evidence_id', $evidenceId)
            ->assertJsonPath('data.movement_ids', [])
            ->assertJsonPath('data.finding_ids', []);

        // Simulate inspected RM readiness, then replace IPC material -> RM readiness must invalidate back to draft
        OpeningRm::whereKey($rmId)->update([
            'status' => 'inspected',
            'inspection_data' => [
                'inspector_id' => $this->observerId,
                'inspected_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'material_version' => 1,
                'technical_representative_id' => null,
                'inspection_notes' => 'Prior inspection',
            ],
            'snapshot_sha256' => str_repeat('a', 64),
        ]);

        // Replace IPC -> material_version becomes 2; dependent RM is invalidated to draft while pinning old ipc_material_version=1
        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}", [
                'expected_revision' => 1,
                'reason' => 'Update count lines',
                'material' => $this->completeMaterial($policies, [$this->makeLine($line1, 'usable', '12', [$this->custodianId])]),
            ])
            ->assertOk()
            ->assertJsonPath('data.record.material_version', 2)
            ->assertJsonPath('data.record.counts', []);

        $rmAfterSourceChange = $this->asOfficer($this->observerId)->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}");
        $rmAfterSourceChange->assertOk()
            ->assertJsonPath('data.state', 'draft')
            ->assertJsonPath('data.inspection', null)
            ->assertJsonPath('data.snapshot_sha256', null)
            ->assertJsonPath('data.material.ipc_material_version', 1)
            ->assertJsonPath('data.revision', 2);

        // Replacing RM with stale ipc_material_version=1 fails with 409 snapshot_stale
        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}", [
                'expected_revision' => 2,
                'reason' => 'Stale source version',
                'material' => ['ipc_material_version' => 1, 'lines' => [], 'notes' => null],
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'snapshot_stale');

        // Replacing RM with current ipc_material_version=2 succeeds and retains history revision 1
        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}", [
                'expected_revision' => 2,
                'reason' => 'Adopt IPC material v2',
                'material' => [
                    'ipc_material_version' => 2,
                    'lines' => [[
                        'ipc_line_id' => $line1,
                        'accepted_quantity' => '12',
                        'damaged_quantity' => '0',
                        'rejected_quantity' => '0',
                        'accepted_value' => '300.00',
                        'finding_reason' => null,
                    ]],
                    'notes' => 'Draft inspection values',
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.record.revision', 3)
            ->assertJsonPath('data.record.material_version', 2)
            ->assertJsonPath('data.record.reference', null);

        $this->asOfficer($this->observerId)->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/versions/1")
            ->assertOk()
            ->assertJsonPath('data.material.ipc_material_version', 1)
            ->assertJsonPath('data.material.lines', []);

        // Print endpoints return escaped text/html with strict CSP and nosniff, and never post stock
        $printIpc = $this->asOfficer($this->custodianId)->get("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/print");
        $printIpc->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Cache-Control', 'no-store')
            ->assertHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        $this->assertStringContainsString('text/html', (string) $printIpc->headers->get('Content-Type'));

        $printRm = $this->asOfficer($this->observerId)->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/print");
        $printRm->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');

        // List endpoints enforce state filter family and pagination
        $this->asOfficer($this->custodianId)->get("/api/v1/chapters/{$this->chapterId}/ipcs?state=inspected")
            ->assertStatus(400)->assertJsonPath('error.code', 'invalid_selector');
        $this->asOfficer($this->observerId)->get("/api/v1/chapters/{$this->chapterId}/opening-rms?state=authorized")
            ->assertStatus(400)->assertJsonPath('error.code', 'invalid_selector');
        $this->asOfficer($this->observerId)->get("/api/v1/chapters/{$this->chapterId}/opening-rms?ipc_id={$ipcId}")
            ->assertOk()->assertJsonCount(1, 'data');

        // Foreign chapter isolation -> uniform 404 chapter_not_found
        $this->asOfficer($this->custodianId)->get("/api/v1/chapters/{$this->foreignChapterId}/ipcs/{$ipcId}")
            ->assertStatus(404)->assertJsonPath('error.code', 'chapter_not_found');

        // Posted baseline locks out new drafts
        OpeningRm::whereKey($rmId)->update(['status' => 'posted', 'posted_chapter_id' => $this->chapterId]);
        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs", ['material' => $this->emptyIpcMaterial()])
            ->assertStatus(409)->assertJsonPath('error.code', 'baseline_already_posted');
        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}", [
                'expected_revision' => 3,
                'reason' => 'Attempt edit posted RM',
                'material' => ['ipc_material_version' => 2, 'lines' => [], 'notes' => null],
            ])
            ->assertStatus(409)->assertJsonPath('error.code', 'target_locked');

        // Zero posting/movement/lot side effects from draft/count/evidence/print operations
        $this->assertSame(0, InventoryPosting::count());
        $this->assertSame(0, InventoryMovement::count());
        $this->assertSame(0, InventoryLot::count());
    }

    /** @return array<string, mixed> */
    private function emptyIpcMaterial(): array
    {
        return [
            'cutoff_at' => null,
            'informal_movements_suspended' => false,
            'count_team' => [],
            'policies' => [],
            'lines' => [],
            'notes' => null,
        ];
    }

    /** @return list<array<string, mixed>> */
    private function seedEffectivePolicies(): array
    {
        $defs = [
            'ipc_authorization' => ['CHAPTER_HEAD', 'IpcAuthorizationPolicyValue', [
                'cutoff_at' => $this->cutoffAt,
                'count_team_ids' => [$this->custodianId, $this->observerId],
                'suspension_record_reference' => 'SUSP-001',
            ]],
            'reference_series' => ['CHAPTER_HEAD', 'OpeningReferencePolicyValue', [
                'ipc_prefix' => 'CEB-IPC',
                'rm_prefix' => 'CEB-RM',
                'minimum_digits' => 6,
            ]],
            'valuation_rounding' => ['FINANCE', 'OpeningValuationPolicyValue', [
                'currency' => 'PHP',
                'unit_value_scale' => 2,
                'rounding_mode' => 'half_up',
                'round_at' => 'accepted_line',
                'valuation_basis_reference' => 'VAL-001',
            ]],
        ];

        $bindings = [];
        foreach ($defs as $key => [$owner, $schema, $value]) {
            $policyId = (string) Str::uuid();
            PolicyRecord::create([
                'id' => $policyId,
                'aggregate_id' => $policyId,
                'chapter_id' => $this->chapterId,
                'policy_code' => $key,
                'policy_version' => 1,
                'rules_json' => $value,
                'effective_from' => now()->subHour(),
                'effective_until' => null,
            ]);
            AuditLog::create([
                'chapter_id' => $this->chapterId,
                'user_id' => $this->headId,
                'action' => 'controlled:recordPolicy',
                'entity_type' => 'policy',
                'entity_id' => $policyId,
                'details' => [
                    'version' => 1,
                    'subject_id' => null,
                    'value_schema_reference' => '#/components/schemas/'.$schema,
                    'value_sha256' => CanonicalJson::sha256($value),
                    'approvals' => [['authority' => $owner, 'approver_id' => $this->headId]],
                ],
            ]);
            $bindings[] = ['setting_key' => $key, 'policy_id' => $policyId, 'version' => 1];
        }

        return $bindings;
    }

    /** @return array<string, mixed> */
    private function makeLine(string $lineId, string $condition, string $qty, array $custodianIds): array
    {
        return [
            'line_id' => $lineId,
            'item_id' => $this->itemId,
            'variant_id' => $this->variantId,
            'variant_material_version' => 1,
            'unit_id' => $this->unitId,
            'unit_material_version' => 1,
            'quantity_scale' => 0,
            'historical_variant_label' => 'Example shirt / M',
            'location_id' => $this->locationId,
            'location_material_version' => 1,
            'regular_custodian_ids' => $custodianIds,
            'condition' => $condition,
            'counted_quantity' => $qty,
            'unit_value' => '25.00',
            'valuation_basis' => 'Documented cost basis',
            'provenance_reference' => 'Sheet O-1',
            'restrictions' => [
                'state' => 'unrestricted',
                'allowed_uses' => ['internal_use', 'sale', 'booth_custody'],
                'event_ids' => [],
                'requesting_unit_ids' => [],
                'effective_from' => null,
                'effective_until' => null,
                'interpretation_id' => null,
                'source_condition_reference' => null,
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function completeMaterial(array $policies, array $lines, bool $spoofCustodianFalse = false): array
    {
        return [
            'cutoff_at' => $this->cutoffAt,
            'informal_movements_suspended' => true,
            'count_team' => [
                ['user_id' => $this->custodianId, 'regular_custodian' => ! $spoofCustodianFalse],
                ['user_id' => $this->observerId, 'regular_custodian' => false],
            ],
            'policies' => $policies,
            'lines' => $lines,
            'notes' => 'Frozen physical count',
        ];
    }

    private function uploadPaper(string $userId, string $rmId, string $key): TestResponse
    {
        $boundary = 'ysp-ticket08-boundary';
        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ([
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>',
        ] as $i => $object) {
            $offsets[] = sprintf("%010d 00000 n \n", strlen($pdf));
            $pdf .= ($i + 1)." 0 obj\n{$object}\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= "xref\n0 4\n0000000000 65535 f \n".implode('', $offsets)."trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF\n";

        $raw = "--{$boundary}\r\n"
            ."Content-Disposition: form-data; name=\"purpose\"\r\n\r\nopening_receipt\r\n"
            ."--{$boundary}\r\n"
            ."Content-Disposition: form-data; name=\"record_id\"\r\n\r\n{$rmId}\r\n"
            ."--{$boundary}\r\n"
            ."Content-Disposition: form-data; name=\"attachments\"; filename=\"signed.pdf\"\r\n"
            ."Content-Type: application/pdf\r\n\r\n{$pdf}\r\n"
            ."--{$boundary}--\r\n";

        $this->asOfficer($userId, $key);

        return $this->call(
            'POST',
            "/api/v1/chapters/{$this->chapterId}/evidence",
            cookies: $this->prepareCookiesForRequest(),
            server: $this->transformHeadersToServerVars(['Accept' => 'application/json'])
                + ['CONTENT_TYPE' => "multipart/form-data; boundary={$boundary}"],
            content: $raw,
        );
    }

    private function asOfficer(string $userId, ?string $actionKey = null): self
    {
        $session = $this->sessionFor($userId);
        $headers = [
            'Origin' => $this->origin,
            'X-XSRF-TOKEN' => $session['csrf'],
        ];
        if ($actionKey !== null) {
            $headers['X-Action-Key'] = $actionKey;
        }

        return $this->flushHeaders()
            ->withCredentials()
            ->withUnencryptedCookie('ysp_session', $session['token'])
            ->withHeaders($headers);
    }

    /** @return array{token: string, csrf: string} */
    private function sessionFor(string $userId): array
    {
        config(['app.url' => $this->origin]);
        app('url')->useOrigin($this->origin);
        app('url')->forceScheme('https');

        $session = new BrowserSession([
            'user_id' => $userId,
            'user_version' => User::findOrFail($userId)->version,
            'authentication_method' => 'password',
            'authenticated_at' => now(),
            'expires_at' => now()->addHour(),
        ]);
        $token = $session->rotateToken();
        $session->save();

        return ['token' => $token, 'csrf' => $session->csrf_token];
    }
}
