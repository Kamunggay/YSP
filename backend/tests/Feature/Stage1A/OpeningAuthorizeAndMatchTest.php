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
use App\Models\EvidenceBlob;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\InventoryPosting;
use App\Models\PolicyRecord;
use App\Models\StockHold;
use App\Models\User;
use App\Services\Shared\CanonicalJson;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class OpeningAuthorizeAndMatchTest extends TestCase
{
    use RefreshDatabase;

    private string $origin = 'https://opening.example.invalid';

    private string $chapterId;

    private string $custodianId;

    private string $custodianTwoId;

    private string $observerId;

    private string $headId;

    private string $financeId;

    private string $dualOfficerId;

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
        $this->custodianId = (string) Str::uuid();
        $this->custodianTwoId = (string) Str::uuid();
        $this->observerId = (string) Str::uuid();
        $this->headId = (string) Str::uuid();
        $this->financeId = (string) Str::uuid();
        $this->dualOfficerId = (string) Str::uuid();

        Chapter::create(['id' => $this->chapterId, 'code' => 'SYN-CEB', 'name' => 'Cebu Chapter', 'status' => 'live', 'version' => 1]);

        foreach ([
            [$this->custodianId, 'custodian@example.invalid', 'Custodian A', ['INVENTORY']],
            [$this->custodianTwoId, 'custodian2@example.invalid', 'Custodian A2', ['INVENTORY']],
            [$this->observerId, 'observer@example.invalid', 'Observer B', ['INDEPENDENT_REVIEWER', 'RECEIVING']],
            [$this->headId, 'head@example.invalid', 'Chapter Head', ['CHAPTER_HEAD']],
            [$this->financeId, 'finance@example.invalid', 'Finance Officer', ['FINANCE']],
            [$this->dualOfficerId, 'dual@example.invalid', 'Dual Head Finance', ['CHAPTER_HEAD', 'FINANCE']],
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

    public function test_complete_submit_authorize_inspect_and_match_flow_retains_attribution_without_posting_stock(): void
    {
        $policies = $this->seedEffectivePolicies();
        $line1 = (string) Str::uuid();
        $line2 = (string) Str::uuid();

        [$ipcId, $rmId, $signedIpcPaper] = $this->prepareCountedIpcAndRm($policies, [
            $this->makeLine($line1, 'usable', '12', [$this->custodianId]),
            $this->makeLine($line2, 'damaged', '2', [$this->custodianId]),
        ]);

        // 1. Submit IPC: issues reference once and replays idempotently
        $submitKey = (string) Str::uuid();
        $submitBody = [
            'expected_revision' => 4,
            'material_version' => 2,
            'signed_ipc' => $this->byteBinding($signedIpcPaper),
        ];
        $submitted = $this->asOfficer($this->custodianId, $submitKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit", $submitBody);

        $submitted->assertOk()
            ->assertHeader('X-Action-Replayed', 'false')
            ->assertHeader('Cache-Control', 'no-store')
            ->assertJsonPath('data.operation.operation', 'submitIpc')
            ->assertJsonPath('data.record.state', 'awaiting_authorization')
            ->assertJsonPath('data.record.revision', 5)
            ->assertJsonPath('data.record.material_version', 2)
            ->assertJsonPath('data.record.signed_ipc', $this->byteBinding($signedIpcPaper))
            ->assertJsonPath('data.posting', null);

        $ipcRef = $submitted->json('data.record.reference');
        $this->assertStringStartsWith('CEB-IPC-', (string) $ipcRef);

        // Replay returns exact receipt; mutated key conflicts
        $this->asOfficer($this->custodianId, $submitKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit", $submitBody)
            ->assertOk()
            ->assertHeader('X-Action-Replayed', 'true')
            ->assertJsonPath('data.record.reference', $ipcRef);
        $this->asOfficer($this->custodianId, $submitKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit", ['expected_revision' => 5] + $submitBody)
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'action_key_conflict');

        // 2. Authorize IPC: Head then Finance
        $headSignedAt = now('UTC')->subSeconds(10)->format('Y-m-d\TH:i:s.u\Z');
        $this->asOfficer($this->headId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => 5,
                'material_version' => 2,
                'duty' => 'FINANCE',
                'signed_at' => $headSignedAt,
            ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'duty_denied');

        $headAuth = $this->asOfficer($this->headId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => 5,
                'material_version' => 2,
                'duty' => 'CHAPTER_HEAD',
                'signed_at' => $headSignedAt,
            ]);
        $headAuth->assertOk()
            ->assertJsonPath('data.operation.operation', 'authorizeIpc')
            ->assertJsonPath('data.record.state', 'awaiting_authorization')
            ->assertJsonPath('data.record.revision', 6)
            ->assertJsonPath('data.record.authorizations.0.duty', 'CHAPTER_HEAD')
            ->assertJsonPath('data.record.authorizations.0.actor_id', $this->headId)
            ->assertJsonPath('data.record.authorizations.0.signed_ipc', $this->byteBinding($signedIpcPaper));

        // Filling an occupied slot conflicts
        $this->asOfficer($this->headId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => 6,
                'material_version' => 2,
                'duty' => 'CHAPTER_HEAD',
                'signed_at' => $headSignedAt,
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'invalid_transition');

        $financeSignedAt = now('UTC')->subSeconds(5)->format('Y-m-d\TH:i:s.u\Z');
        $finAuth = $this->asOfficer($this->financeId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => 6,
                'material_version' => 2,
                'duty' => 'FINANCE',
                'signed_at' => $financeSignedAt,
            ]);
        $finAuth->assertOk()
            ->assertJsonPath('data.record.state', 'authorized')
            ->assertJsonPath('data.record.revision', 7)
            ->assertJsonPath('data.record.authorizations.0.duty', 'CHAPTER_HEAD')
            ->assertJsonPath('data.record.authorizations.1.duty', 'FINANCE')
            ->assertJsonPath('data.record.authorizations.1.actor_id', $this->financeId);

        // Authorized history, revisions, related reads, and print retain source and attribution
        $this->asOfficer($this->observerId)->get("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/history")
            ->assertOk()
            ->assertJsonCount(7, 'data')
            ->assertJsonPath('data.4.operation.operation', 'submitIpc')
            ->assertJsonPath('data.6.operation.operation', 'authorizeIpc');

        $this->asOfficer($this->observerId)->get("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/versions/7")
            ->assertOk()
            ->assertJsonPath('data.reference', $ipcRef)
            ->assertJsonPath('data.state', 'authorized')
            ->assertJsonPath('data.authorizations.0.actor_id', $this->headId)
            ->assertJsonPath('data.authorizations.1.actor_id', $this->financeId);

        $this->asOfficer($this->observerId)->get("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/related")
            ->assertOk()
            ->assertJsonPath('data.ipc_id', $ipcId)
            ->assertJsonPath('data.rm_ids', [$rmId])
            ->assertJsonPath('data.evidence.0', $this->byteBinding($signedIpcPaper));

        $ipcPrint = $this->asOfficer($this->observerId)->get("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/print")
            ->assertOk()
            ->getContent();
        $this->assertStringContainsString($ipcRef, $ipcPrint);
        $this->assertStringContainsString($this->headId, $ipcPrint);
        $this->assertStringContainsString($this->financeId, $ipcPrint);

        // 3. Populate RM draft lines and inspect Opening RM (downgrading 2 of 12 usable into damaged/rejected)
        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}", [
                'expected_revision' => 1,
                'reason' => 'Record inspection breakdown',
                'material' => [
                    'ipc_material_version' => 2,
                    'lines' => [
                        [
                            'ipc_line_id' => $line1,
                            'accepted_quantity' => '10',
                            'damaged_quantity' => '1',
                            'rejected_quantity' => '1',
                            'accepted_value' => '250.00',
                            'finding_reason' => '1 torn sleeve, 1 stained',
                        ],
                        [
                            'ipc_line_id' => $line2,
                            'accepted_quantity' => '0',
                            'damaged_quantity' => '2',
                            'rejected_quantity' => '0',
                            'accepted_value' => '0.00',
                            'finding_reason' => 'Already damaged at count',
                        ],
                    ],
                    'notes' => 'Inspected against authorized IPC',
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.record.revision', 2)
            ->assertJsonPath('data.record.material_version', 2);

        $inspectedAt = now('UTC')->format('Y-m-d\TH:i:s.u\Z');
        $inspected = $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/inspection", [
                'expected_revision' => 2,
                'ipc_material_version' => 2,
                'inspected_at' => $inspectedAt,
                'technical_representative_id' => null,
                'inspection_notes' => 'All lines verified against authorized IPC.',
            ]);

        $inspected->assertOk()
            ->assertHeader('X-Action-Replayed', 'false')
            ->assertJsonPath('data.operation.operation', 'inspectOpeningRm')
            ->assertJsonPath('data.record.state', 'inspected')
            ->assertJsonPath('data.record.revision', 3)
            ->assertJsonPath('data.record.inspection.inspector_id', $this->observerId)
            ->assertJsonPath('data.record.snapshot.ipc_reference', $ipcRef)
            ->assertJsonPath('data.posting', null);

        $snapshot = $inspected->json('data.record.snapshot');
        $snapshotSha = $inspected->json('data.record.snapshot_sha256');
        $this->assertSame(CanonicalJson::sha256($snapshot), $snapshotSha);

        // 4. Upload final signed receipt paper and match inspected Opening RM
        $receiptPaper = $this->uploadPaper($this->observerId, 'opening_receipt', $rmId, (string) Str::uuid())
            ->assertCreated()
            ->json('data');

        $matchKey = (string) Str::uuid();
        $matchBody = [
            'expected_revision' => 3,
            'material_version' => 2,
            'snapshot_sha256' => $snapshotSha,
            'bytes' => $this->byteBinding($receiptPaper),
            'acknowledged_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
        ];
        $matched = $this->asOfficer($this->observerId, $matchKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/evidence-match", $matchBody);

        $matched->assertOk()
            ->assertHeader('X-Action-Replayed', 'false')
            ->assertJsonPath('data.operation.operation', 'matchOpeningRmEvidence')
            ->assertJsonPath('data.record.state', 'matched')
            ->assertJsonPath('data.record.revision', 4)
            ->assertJsonPath('data.record.acknowledgment.matched_by', $this->observerId)
            ->assertJsonPath('data.record.acknowledgment.recipient_id', null)
            ->assertJsonPath('data.record.acknowledgment.bytes', $this->byteBinding($receiptPaper))
            ->assertJsonPath('data.posting', null);

        // Replay returns original acknowledgment; a fresh match key while actively matched is rejected
        $this->asOfficer($this->observerId, $matchKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/evidence-match", $matchBody)
            ->assertOk()
            ->assertHeader('X-Action-Replayed', 'true')
            ->assertJsonPath('data.record.acknowledgment.acknowledgment_id', $matched->json('data.record.acknowledgment.acknowledgment_id'));

        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/evidence-match", [
                'expected_revision' => 4,
                'material_version' => 2,
                'snapshot_sha256' => $snapshotSha,
                'bytes' => $this->byteBinding($receiptPaper),
                'acknowledged_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'invalid_transition');

        $rmPrint = $this->asOfficer($this->observerId)->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/print")
            ->assertOk()
            ->getContent();
        $this->assertStringContainsString($ipcRef, $rmPrint);
        $this->assertStringContainsString($this->observerId, $rmPrint);

        // Draft, print, inspection, and evidence match leave physical balance completely unchanged
        $this->assertSame(0, InventoryPosting::count());
        $this->assertSame(0, InventoryMovement::count());
        $this->assertSame(0, InventoryLot::count());
    }

    public function test_submit_rejects_count_disagreement_missing_policy_and_custodian_only_counts_and_retains_reference_on_revision(): void
    {
        $policies = $this->seedEffectivePolicies();
        $line1 = (string) Str::uuid();

        // 1. Missing policy blocks submit with 428 setup_blocked
        $ipcId = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs", ['material' => $this->emptyIpcMaterial()])
            ->assertCreated()->json('data.record.id');
        $rmId = $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms", [
                'ipc_id' => $ipcId,
                'material' => ['ipc_material_version' => 1, 'lines' => [], 'notes' => null],
            ])->assertCreated()->json('data.record.id');
        $paper = $this->uploadPaper($this->observerId, 'opening_receipt', $rmId, (string) Str::uuid())->assertCreated()->json('data');

        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit", [
                'expected_revision' => 1,
                'material_version' => 1,
                'signed_ipc' => $this->byteBinding($paper),
            ])
            ->assertStatus(428)
            ->assertJsonPath('error.code', 'setup_blocked');

        // 2. Count disagreement returns 409 count_mismatch and issues no reference
        $material = $this->completeMaterial($policies, [$this->makeLine($line1, 'usable', '10', [$this->custodianId])]);
        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}", [
                'expected_revision' => 1, 'reason' => 'Populate', 'material' => $material,
            ])->assertOk();

        $t = now('UTC')->subSeconds(20)->format('Y-m-d\TH:i:s.u\Z');
        $this->saveCount($this->custodianId, $ipcId, 2, 2, $t, $line1, '10', 'usable')->assertOk();
        $this->saveCount($this->observerId, $ipcId, 3, 2, $t, $line1, '9', 'usable')->assertOk();

        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit", [
                'expected_revision' => 4,
                'material_version' => 2,
                'signed_ipc' => $this->byteBinding($paper),
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'count_mismatch');

        $this->asOfficer($this->custodianId)->get("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}")
            ->assertOk()
            ->assertJsonPath('data.reference', null);

        // 3. Fix count, submit (issues reference), revise IPC, recount, resubmit -> retains exact same reference
        $this->saveCount($this->observerId, $ipcId, 4, 2, $t, $line1, '10', 'usable')->assertOk();
        $firstRef = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit", [
                'expected_revision' => 5,
                'material_version' => 2,
                'signed_ipc' => $this->byteBinding($paper),
            ])
            ->assertOk()
            ->json('data.record.reference');

        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}", [
                'expected_revision' => 6, 'reason' => 'Adjust note after review',
                'material' => array_replace($material, ['notes' => 'Revised count sheet']),
            ])->assertOk()->assertJsonPath('data.record.reference', $firstRef);

        $this->saveCount($this->custodianId, $ipcId, 7, 3, $t, $line1, '10', 'usable')->assertOk();
        $this->saveCount($this->observerId, $ipcId, 8, 3, $t, $line1, '10', 'usable')->assertOk();

        $secondRef = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit", [
                'expected_revision' => 9,
                'material_version' => 3,
                'signed_ipc' => $this->byteBinding($paper),
            ])
            ->assertOk()
            ->json('data.record.reference');
        $this->assertSame($firstRef, $secondRef);

        // 4. Single officer holding BOTH CHAPTER_HEAD and FINANCE may fill both slots
        $signTime = now('UTC')->subSeconds(5)->format('Y-m-d\TH:i:s.u\Z');
        $this->asOfficer($this->dualOfficerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => 10, 'material_version' => 3, 'duty' => 'CHAPTER_HEAD', 'signed_at' => $signTime,
            ])->assertOk()->assertJsonPath('data.record.state', 'awaiting_authorization');
        $this->asOfficer($this->dualOfficerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => 11, 'material_version' => 3, 'duty' => 'FINANCE', 'signed_at' => $signTime,
            ])->assertOk()->assertJsonPath('data.record.state', 'authorized');

        // 5. Custodian-only counts (both counters are recorded custodians) rejected with 403 independence_required
        $custPolicies = $this->seedEffectivePolicies([$this->custodianId, $this->custodianTwoId]);
        $custIpcId = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs", [
                'material' => [
                    'cutoff_at' => $this->cutoffAt,
                    'informal_movements_suspended' => true,
                    'count_team' => [
                        ['user_id' => $this->custodianId, 'regular_custodian' => true],
                        ['user_id' => $this->custodianTwoId, 'regular_custodian' => true],
                    ],
                    'policies' => $custPolicies,
                    'lines' => [$this->makeLine($line1, 'usable', '5', [$this->custodianId, $this->custodianTwoId])],
                    'notes' => 'Custodian only team',
                ],
            ])->assertCreated()->json('data.record.id');
        $custRmId = $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms", [
                'ipc_id' => $custIpcId,
                'material' => ['ipc_material_version' => 1, 'lines' => [], 'notes' => null],
            ])->assertCreated()->json('data.record.id');
        $custPaper = $this->uploadPaper($this->observerId, 'opening_receipt', $custRmId, (string) Str::uuid())->assertCreated()->json('data');

        $this->saveCount($this->custodianId, $custIpcId, 1, 1, $t, $line1, '5', 'usable')->assertOk();
        $this->saveCount($this->custodianTwoId, $custIpcId, 2, 1, $t, $line1, '5', 'usable')->assertOk();

        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$custIpcId}/submit", [
                'expected_revision' => 3,
                'material_version' => 1,
                'signed_ipc' => $this->byteBinding($custPaper),
            ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'independence_required');
    }

    public function test_inspection_rejects_unauthorized_or_stale_source_incomplete_lines_arithmetic_and_condition_upgrade(): void
    {
        $policies = $this->seedEffectivePolicies();
        $line1 = (string) Str::uuid();
        $line2 = (string) Str::uuid();

        [$ipcId, $rmId, $paper] = $this->prepareCountedIpcAndRm($policies, [
            $this->makeLine($line1, 'usable', '10', [$this->custodianId]),
            $this->makeLine($line2, 'damaged', '3', [$this->custodianId]),
        ]);

        // 1. Inspecting before IPC is authorized returns 409 source_not_authorized
        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/inspection", [
                'expected_revision' => 1,
                'ipc_material_version' => 2,
                'inspected_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'technical_representative_id' => null,
                'inspection_notes' => 'Premature inspection',
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'source_not_authorized');

        // Submit & authorize IPC
        $this->submitAndAuthorize($ipcId, 4, 2, $paper);

        // 2. Omitted source line -> 409 source_incomplete
        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}", [
                'expected_revision' => 1,
                'reason' => 'Only one line',
                'material' => [
                    'ipc_material_version' => 2,
                    'lines' => [[
                        'ipc_line_id' => $line1,
                        'accepted_quantity' => '10', 'damaged_quantity' => '0', 'rejected_quantity' => '0',
                        'accepted_value' => '250.00', 'finding_reason' => null,
                    ]],
                    'notes' => null,
                ],
            ])->assertOk();

        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/inspection", [
                'expected_revision' => 2, 'ipc_material_version' => 2,
                'inspected_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'technical_representative_id' => null, 'inspection_notes' => 'Missing line 2',
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'source_incomplete');

        // 3. Sum mismatch (accepted + damaged + rejected != counted) -> 409 invalid_source
        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}", [
                'expected_revision' => 2, 'reason' => 'Wrong total',
                'material' => [
                    'ipc_material_version' => 2,
                    'lines' => [
                        ['ipc_line_id' => $line1, 'accepted_quantity' => '9', 'damaged_quantity' => '0', 'rejected_quantity' => '0', 'accepted_value' => '225.00', 'finding_reason' => null],
                        ['ipc_line_id' => $line2, 'accepted_quantity' => '0', 'damaged_quantity' => '3', 'rejected_quantity' => '0', 'accepted_value' => '0.00', 'finding_reason' => 'Damaged'],
                    ],
                    'notes' => null,
                ],
            ])->assertOk();

        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/inspection", [
                'expected_revision' => 3, 'ipc_material_version' => 2,
                'inspected_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'technical_representative_id' => null, 'inspection_notes' => 'Sum off',
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'invalid_source');

        // 4. Upgrading damaged source line into accepted -> 409 invalid_source
        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}", [
                'expected_revision' => 3, 'reason' => 'Upgrade damaged',
                'material' => [
                    'ipc_material_version' => 2,
                    'lines' => [
                        ['ipc_line_id' => $line1, 'accepted_quantity' => '10', 'damaged_quantity' => '0', 'rejected_quantity' => '0', 'accepted_value' => '250.00', 'finding_reason' => null],
                        ['ipc_line_id' => $line2, 'accepted_quantity' => '1', 'damaged_quantity' => '2', 'rejected_quantity' => '0', 'accepted_value' => '25.00', 'finding_reason' => 'Upgraded'],
                    ],
                    'notes' => null,
                ],
            ])->assertOk();

        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/inspection", [
                'expected_revision' => 4, 'ipc_material_version' => 2,
                'inspected_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'technical_representative_id' => null, 'inspection_notes' => 'Try upgrade',
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'invalid_source');

        // 5. Wrong accepted_value -> 409 invalid_source
        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}", [
                'expected_revision' => 4, 'reason' => 'Bad valuation',
                'material' => [
                    'ipc_material_version' => 2,
                    'lines' => [
                        ['ipc_line_id' => $line1, 'accepted_quantity' => '10', 'damaged_quantity' => '0', 'rejected_quantity' => '0', 'accepted_value' => '251.00', 'finding_reason' => null],
                        ['ipc_line_id' => $line2, 'accepted_quantity' => '0', 'damaged_quantity' => '3', 'rejected_quantity' => '0', 'accepted_value' => '0.00', 'finding_reason' => 'Damaged'],
                    ],
                    'notes' => null,
                ],
            ])->assertOk();

        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/inspection", [
                'expected_revision' => 5, 'ipc_material_version' => 2,
                'inspected_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'technical_representative_id' => null, 'inspection_notes' => 'Wrong value',
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'invalid_source');

        // 6. Stale IPC material version after replaceIpc -> 409 snapshot_stale
        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}", [
                'expected_revision' => 5, 'reason' => 'Valid breakdown',
                'material' => [
                    'ipc_material_version' => 2,
                    'lines' => [
                        ['ipc_line_id' => $line1, 'accepted_quantity' => '10', 'damaged_quantity' => '0', 'rejected_quantity' => '0', 'accepted_value' => '250.00', 'finding_reason' => null],
                        ['ipc_line_id' => $line2, 'accepted_quantity' => '0', 'damaged_quantity' => '3', 'rejected_quantity' => '0', 'accepted_value' => '0.00', 'finding_reason' => 'Damaged'],
                    ],
                    'notes' => null,
                ],
            ])->assertOk();

        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/inspection", [
                'expected_revision' => 6, 'ipc_material_version' => 1,
                'inspected_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'technical_representative_id' => null, 'inspection_notes' => 'Stale version',
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'snapshot_stale');
    }

    public function test_wrong_purpose_wrong_target_superseded_and_corrupted_paper_require_renewed_authorization_or_matching(): void
    {
        $policies = $this->seedEffectivePolicies();
        $line1 = (string) Str::uuid();

        [$ipcId, $rmId, $signedPaper] = $this->prepareCountedIpcAndRm($policies, [
            $this->makeLine($line1, 'usable', '8', [$this->custodianId]),
        ]);

        // Create a hold_clearance paper (wrong purpose) and another RM's paper (wrong target)
        $hold = StockHold::create([
            'chapter_id' => $this->chapterId,
            'status' => 'active',
            'version' => 1,
            'material_version' => 1,
            'reason_code' => 'quality_check',
            'reason' => 'Wrong purpose fixture',
            'placed_by_user_id' => $this->custodianId,
            'placed_at' => now(),
        ]);
        $holdPaper = $this->uploadPaper($this->custodianId, 'hold_clearance', $hold->id, (string) Str::uuid())
            ->assertCreated()->json('data');

        $otherRmId = $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms", [
                'ipc_id' => $ipcId,
                'material' => ['ipc_material_version' => 2, 'lines' => [], 'notes' => 'Second RM'],
            ])->assertCreated()->json('data.record.id');
        $otherRmPaper = $this->uploadPaper($this->observerId, 'opening_receipt', $otherRmId, (string) Str::uuid())
            ->assertCreated()->json('data');

        // 1. Submit with wrong-purpose paper rejected with 409 evidence_mismatch
        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit", [
                'expected_revision' => 4,
                'material_version' => 2,
                'signed_ipc' => $this->byteBinding($holdPaper),
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'evidence_mismatch');

        // 2. Submit with signedPaper, then supersede signedPaper -> authorizeIpc rejected with 409 evidence_mismatch
        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit", [
                'expected_revision' => 4,
                'material_version' => 2,
                'signed_ipc' => $this->byteBinding($signedPaper),
            ])->assertOk();

        $signedPaperV2 = $this->replacePaper($this->observerId, $signedPaper['evidence_id'], 1, 'Rescanned signed IPC', (string) Str::uuid())
            ->assertCreated()->json('data');

        $this->asOfficer($this->headId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => 5, 'material_version' => 2, 'duty' => 'CHAPTER_HEAD',
                'signed_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'evidence_mismatch');

        // Revise IPC, recount, submit with current signedPaperV2, authorize, inspect RM
        $material = $this->completeMaterial($policies, [$this->makeLine($line1, 'usable', '8', [$this->custodianId])]);
        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}", [
                'expected_revision' => 5, 'reason' => 'Re-bind current signed IPC paper', 'material' => $material,
            ])->assertOk();
        $t = now('UTC')->subSeconds(10)->format('Y-m-d\TH:i:s.u\Z');
        $this->saveCount($this->custodianId, $ipcId, 6, 3, $t, $line1, '8', 'usable')->assertOk();
        $this->saveCount($this->observerId, $ipcId, 7, 3, $t, $line1, '8', 'usable')->assertOk();
        $this->submitAndAuthorize($ipcId, 8, 3, $signedPaperV2);

        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}", [
                'expected_revision' => 1, 'reason' => 'Match IPC v3',
                'material' => [
                    'ipc_material_version' => 3,
                    'lines' => [[
                        'ipc_line_id' => $line1, 'accepted_quantity' => '8', 'damaged_quantity' => '0',
                        'rejected_quantity' => '0', 'accepted_value' => '200.00', 'finding_reason' => null,
                    ]],
                    'notes' => null,
                ],
            ])->assertOk();

        $inspected = $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/inspection", [
                'expected_revision' => 2, 'ipc_material_version' => 3,
                'inspected_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'technical_representative_id' => null, 'inspection_notes' => 'Inspected v3',
            ])->assertOk();
        $sha = $inspected->json('data.record.snapshot_sha256');

        // 3. Match with wrong-purpose paper, another RM's paper, and superseded paper version all return 409 evidence_mismatch
        $now = now('UTC')->format('Y-m-d\TH:i:s.u\Z');
        foreach ([$holdPaper, $otherRmPaper, $signedPaper] as $badPaper) {
            $this->asOfficer($this->observerId, (string) Str::uuid())
                ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/evidence-match", [
                    'expected_revision' => 3, 'material_version' => 2, 'snapshot_sha256' => $sha,
                    'bytes' => $this->byteBinding($badPaper), 'acknowledged_at' => $now,
                ])
                ->assertStatus(409)
                ->assertJsonPath('error.code', 'evidence_mismatch');
        }

        // 4. Match with separate receipt paper, then supersede receipt paper -> state reverts to inspected and accepts renewed match
        $receiptV1 = $this->uploadPaper($this->observerId, 'opening_receipt', $rmId, (string) Str::uuid())->assertCreated()->json('data');
        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/evidence-match", [
                'expected_revision' => 3, 'material_version' => 2, 'snapshot_sha256' => $sha,
                'bytes' => $this->byteBinding($receiptV1), 'acknowledged_at' => $now,
            ])->assertOk()->assertJsonPath('data.record.state', 'matched');

        $receiptV2 = $this->replacePaper($this->observerId, $receiptV1['evidence_id'], 1, 'Clearer scan', (string) Str::uuid())
            ->assertCreated()->json('data');

        $this->asOfficer($this->observerId)->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}")
            ->assertOk()
            ->assertJsonPath('data.state', 'inspected')
            ->assertJsonPath('data.acknowledgment', null);

        // Missing blob on disk returns 409 evidence_invalid
        $blob = EvidenceBlob::findOrFail($receiptV2['attachments'][0]['attachment_id']);
        $bytesBackup = Storage::disk('evidence')->get($blob->payload_path);
        Storage::disk('evidence')->delete($blob->payload_path);
        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/evidence-match", [
                'expected_revision' => 4, 'material_version' => 2, 'snapshot_sha256' => $sha,
                'bytes' => $this->byteBinding($receiptV2), 'acknowledged_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'evidence_invalid');

        // Restore bytes and re-match with receiptV2
        Storage::disk('evidence')->put($blob->payload_path, $bytesBackup);
        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/evidence-match", [
                'expected_revision' => 4, 'material_version' => 2, 'snapshot_sha256' => $sha,
                'bytes' => $this->byteBinding($receiptV2), 'acknowledged_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
            ])
            ->assertOk()
            ->assertJsonPath('data.record.state', 'matched')
            ->assertJsonPath('data.record.acknowledgment.bytes', $this->byteBinding($receiptV2));

        // 5. Replacing IPC material invalidates the matched RM back to draft
        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}", [
                'expected_revision' => 11, 'reason' => 'Post-match source correction',
                'material' => array_replace($material, ['notes' => 'Invalidates RM']),
            ])->assertOk();

        $this->asOfficer($this->observerId)->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}")
            ->assertOk()
            ->assertJsonPath('data.state', 'draft')
            ->assertJsonPath('data.inspection', null)
            ->assertJsonPath('data.snapshot', null)
            ->assertJsonPath('data.acknowledgment', null);
    }

    public function test_revoked_counter_monetary_limit_and_revoked_approver_are_enforced_at_gates(): void
    {
        $policies = $this->seedEffectivePolicies();
        $line1 = (string) Str::uuid();
        [$ipcId, $rmId, $paper] = $this->prepareCountedIpcAndRm($policies, [
            $this->makeLine($line1, 'usable', '10', [$this->custodianId]), // total PHP 250.00
        ]);

        // 1. Revoking observer's ipc.count duty blocks submitIpc with 409 invalid_source
        DutyGrant::where('chapter_id', $this->chapterId)
            ->where('user_id', $this->observerId)
            ->where('duty_code', 'INDEPENDENT_REVIEWER')
            ->update(['status' => 'revoked']);

        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit", [
                'expected_revision' => 4, 'material_version' => 2, 'signed_ipc' => $this->byteBinding($paper),
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'invalid_source');

        // Restore counter duty and submit
        DutyGrant::where('chapter_id', $this->chapterId)
            ->where('user_id', $this->observerId)
            ->where('duty_code', 'INDEPENDENT_REVIEWER')
            ->update(['status' => 'active']);
        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit", [
                'expected_revision' => 4, 'material_version' => 2, 'signed_ipc' => $this->byteBinding($paper),
            ])->assertOk();

        // 2. Monetary ceiling (limit_php < 250.00) denies authorizeIpc with 403 duty_denied
        DutyGrant::where('chapter_id', $this->chapterId)
            ->where('user_id', $this->financeId)
            ->where('duty_code', 'FINANCE')
            ->update(['scope' => ['unit_id' => null, 'limit_php' => '100.00']]);

        $signedAt = now('UTC')->subSeconds(5)->format('Y-m-d\TH:i:s.u\Z');
        $this->asOfficer($this->financeId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => 5, 'material_version' => 2, 'duty' => 'FINANCE', 'signed_at' => $signedAt,
            ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'duty_denied');

        // Raise limit_php to 250.00 (exact boundary) and complete both authorizations
        DutyGrant::where('chapter_id', $this->chapterId)
            ->where('user_id', $this->financeId)
            ->where('duty_code', 'FINANCE')
            ->update(['scope' => ['unit_id' => null, 'limit_php' => '250.00']]);

        $this->asOfficer($this->headId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => 5, 'material_version' => 2, 'duty' => 'CHAPTER_HEAD', 'signed_at' => $signedAt,
            ])->assertOk();
        $this->asOfficer($this->financeId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => 6, 'material_version' => 2, 'duty' => 'FINANCE', 'signed_at' => $signedAt,
            ])->assertOk()->assertJsonPath('data.record.state', 'authorized');

        // 3. Revoking Finance signatory before inspection blocks inspectOpeningRm with 409 source_not_authorized
        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}", [
                'expected_revision' => 1, 'reason' => 'Inspect lines',
                'material' => [
                    'ipc_material_version' => 2,
                    'lines' => [[
                        'ipc_line_id' => $line1, 'accepted_quantity' => '10', 'damaged_quantity' => '0',
                        'rejected_quantity' => '0', 'accepted_value' => '250.00', 'finding_reason' => null,
                    ]],
                    'notes' => null,
                ],
            ])->assertOk();

        DutyGrant::where('chapter_id', $this->chapterId)
            ->where('user_id', $this->financeId)
            ->where('duty_code', 'FINANCE')
            ->update(['status' => 'revoked']);

        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/inspection", [
                'expected_revision' => 2, 'ipc_material_version' => 2,
                'inspected_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'technical_representative_id' => null, 'inspection_notes' => 'Should fail revoked approver',
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'source_not_authorized');
    }

    /** @return array{string, string, array<string, mixed>} */
    private function prepareCountedIpcAndRm(array $policies, array $lines): array
    {
        $ipcId = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs", ['material' => $this->emptyIpcMaterial()])
            ->assertCreated()->json('data.record.id');

        $rmId = $this->asOfficer($this->observerId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms", [
                'ipc_id' => $ipcId,
                'material' => ['ipc_material_version' => 1, 'lines' => [], 'notes' => null],
            ])->assertCreated()->json('data.record.id');

        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}", [
                'expected_revision' => 1,
                'reason' => 'Populate count sheet',
                'material' => $this->completeMaterial($policies, $lines),
            ])->assertOk();

        $countedAt = now('UTC')->subSeconds(30)->format('Y-m-d\TH:i:s.u\Z');
        $entries = array_map(fn (array $l) => [
            'ipc_line_id' => $l['line_id'],
            'quantity' => $l['counted_quantity'],
            'condition' => $l['condition'],
            'notes' => null,
        ], $lines);

        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 2, 'material_version' => 2,
                'counted_at' => $countedAt, 'completed' => true, 'signed_at' => $countedAt, 'entries' => $entries,
            ])->assertOk();

        $this->asOfficer($this->observerId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 3, 'material_version' => 2,
                'counted_at' => $countedAt, 'completed' => true, 'signed_at' => $countedAt, 'entries' => $entries,
            ])->assertOk();

        $paper = $this->uploadPaper($this->observerId, 'opening_receipt', $rmId, (string) Str::uuid())
            ->assertCreated()->json('data');

        return [$ipcId, $rmId, $paper];
    }

    private function submitAndAuthorize(string $ipcId, int $rev, int $matVer, array $paper): void
    {
        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit", [
                'expected_revision' => $rev, 'material_version' => $matVer, 'signed_ipc' => $this->byteBinding($paper),
            ])->assertOk();

        $signedAt = now('UTC')->subSeconds(5)->format('Y-m-d\TH:i:s.u\Z');
        $this->asOfficer($this->headId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => $rev + 1, 'material_version' => $matVer, 'duty' => 'CHAPTER_HEAD', 'signed_at' => $signedAt,
            ])->assertOk();

        $this->asOfficer($this->financeId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => $rev + 2, 'material_version' => $matVer, 'duty' => 'FINANCE', 'signed_at' => $signedAt,
            ])->assertOk()->assertJsonPath('data.record.state', 'authorized');
    }

    private function saveCount(string $actorId, string $ipcId, int $rev, int $matVer, string $at, string $lineId, string $qty, string $cond): TestResponse
    {
        return $this->asOfficer($actorId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => $rev,
                'material_version' => $matVer,
                'counted_at' => $at,
                'completed' => true,
                'signed_at' => $at,
                'entries' => [['ipc_line_id' => $lineId, 'quantity' => $qty, 'condition' => $cond, 'notes' => null]],
            ]);
    }

    /** @return array<string, mixed> */
    private function byteBinding(array $paper): array
    {
        return [
            'evidence_id' => $paper['evidence_id'],
            'version_id' => $paper['version_id'],
            'attachments' => array_map(fn (array $a) => [
                'attachment_id' => $a['attachment_id'],
                'sha256' => $a['sha256'],
            ], $paper['attachments']),
        ];
    }

    /** @return array<string, mixed> */
    private function emptyIpcMaterial(): array
    {
        return [
            'cutoff_at' => null, 'informal_movements_suspended' => false,
            'count_team' => [], 'policies' => [], 'lines' => [], 'notes' => null,
        ];
    }

    /** @return list<array<string, mixed>> */
    private function seedEffectivePolicies(?array $teamIds = null): array
    {
        $defs = [
            'ipc_authorization' => ['CHAPTER_HEAD', 'IpcAuthorizationPolicyValue', [
                'cutoff_at' => $this->cutoffAt,
                'count_team_ids' => $teamIds ?? [$this->custodianId, $this->observerId],
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
    private function completeMaterial(array $policies, array $lines): array
    {
        return [
            'cutoff_at' => $this->cutoffAt,
            'informal_movements_suspended' => true,
            'count_team' => [
                ['user_id' => $this->custodianId, 'regular_custodian' => true],
                ['user_id' => $this->observerId, 'regular_custodian' => false],
            ],
            'policies' => $policies,
            'lines' => $lines,
            'notes' => 'Frozen physical count',
        ];
    }

    private function uploadPaper(string $userId, string $purpose, string $recordId, string $key): TestResponse
    {
        return $this->sendMultipart(
            $userId,
            "/api/v1/chapters/{$this->chapterId}/evidence",
            $key,
            ['purpose' => $purpose, 'record_id' => $recordId],
        );
    }

    private function replacePaper(string $userId, string $evidenceId, int $expectedVersion, string $reason, string $key): TestResponse
    {
        return $this->sendMultipart(
            $userId,
            "/api/v1/chapters/{$this->chapterId}/evidence/{$evidenceId}/versions",
            $key,
            ['expected_version' => (string) $expectedVersion, 'reason' => $reason],
        );
    }

    /** @param array<string, string> $fields */
    private function sendMultipart(string $userId, string $path, string $key, array $fields): TestResponse
    {
        $boundary = 'ysp-ticket09-boundary';
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

        $raw = '';
        foreach ($fields as $name => $value) {
            $raw .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"{$name}\"\r\n\r\n{$value}\r\n";
        }
        $raw .= "--{$boundary}\r\n"
            ."Content-Disposition: form-data; name=\"attachments\"; filename=\"signed.pdf\"\r\n"
            ."Content-Type: application/pdf\r\n\r\n{$pdf}\r\n"
            ."--{$boundary}--\r\n";

        $this->asOfficer($userId, $key);

        return $this->call(
            'POST',
            $path,
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
            'authentication_method' => 'authenticator',
            'authenticated_at' => now(),
            'expires_at' => now()->addHour(),
        ]);
        $token = $session->rotateToken();
        $session->save();

        return ['token' => $token, 'csrf' => $session->csrf_token];
    }
}
