<?php

namespace Tests\Feature\Stage1B;

use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\InventoryLot;
use App\Models\OpeningRm;
use App\Models\User;
use App\Services\Inventory\StockViewQueryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\TestCase;

class OpeningInventoryTest extends TestCase
{
    use AuthenticatesBrowserOfficer;
    use RefreshDatabase;

    private string $chapterId;

    private string $foreignChapterId;

    private string $counter1Id;

    private string $counter2Id;

    private string $headUserId;

    private string $financeUserId;

    private string $unitId;

    private string $itemId;

    private string $variantId;

    private string $locationId;

    private string $cutoffAt = '2026-11-01T00:00:00.000000Z';

    /** @var list<array{setting_key: string, policy_id: string, version: int}> */
    private array $openingPolicies = [];

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('evidence');

        $this->chapterId = (string) Str::uuid();
        $this->foreignChapterId = (string) Str::uuid();

        $this->counter1Id = (string) Str::uuid();
        $this->counter2Id = (string) Str::uuid();
        $this->headUserId = (string) Str::uuid();
        $this->financeUserId = (string) Str::uuid();

        Chapter::create([
            'id' => $this->chapterId,
            'code' => 'SYN-CEBU',
            'name' => 'Cebu Chapter',
            'status' => 'live',
            'version' => 1,
        ]);

        Chapter::create([
            'id' => $this->foreignChapterId,
            'code' => 'SYN-DVO',
            'name' => 'Davao Chapter',
            'status' => 'live',
            'version' => 1,
        ]);

        $users = [
            $this->counter1Id => ['custodian@example.invalid', 'Inventory Custodian', ['INVENTORY']],
            $this->counter2Id => ['reviewer@example.invalid', 'Independent Receiver', ['INDEPENDENT_REVIEWER', 'RECEIVING']],
            $this->headUserId => ['head@example.invalid', 'Chapter Head', ['CHAPTER_HEAD']],
            $this->financeUserId => ['finance@example.invalid', 'Finance Officer', ['FINANCE']],
        ];

        foreach ($users as $id => [$email, $name, $duties]) {
            User::create([
                'id' => $id,
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
                'user_id' => $id,
                'membership_status' => 'active',
                'version' => 1,
            ]);

            foreach ($duties as $duty) {
                DutyGrant::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $this->chapterId,
                    'user_id' => $id,
                    'duty_code' => $duty,
                    'status' => 'active',
                    'is_alternate' => false,
                    'valid_from' => now()->subDay(),
                    'limit_php' => in_array($duty, ['CHAPTER_HEAD', 'FINANCE'], true) ? '100000.00' : null,
                    'version' => 1,
                ]);
            }
        }

        $this->openingPolicies = $this->seedEffectiveStage1Policies(
            $this->chapterId,
            $this->headUserId,
            $this->financeUserId,
            cutoffAt: $this->cutoffAt,
        );

        $this->unitId = (string) Str::uuid();
        CatalogueUnit::create([
            'id' => $this->unitId,
            'chapter_id' => $this->chapterId,
            'code' => 'PCS',
            'name' => 'Pieces',
            'quantity_kind' => 'piece',
            'quantity_scale' => 0,
            'state' => 'active',
            'material_version' => 1,
        ]);

        $this->itemId = (string) Str::uuid();
        CatalogueItem::create([
            'id' => $this->itemId,
            'chapter_id' => $this->chapterId,
            'code' => 'ITEM-SYRINGE',
            'name' => 'Syringes',
            'unit_id' => $this->unitId,
            'state' => 'active',
            'material_version' => 1,
        ]);

        $this->variantId = (string) Str::uuid();
        CatalogueVariant::create([
            'id' => $this->variantId,
            'chapter_id' => $this->chapterId,
            'item_id' => $this->itemId,
            'sku' => 'VAR-SYR-10ML',
            'name' => 'Syringe 10ml',
            'label' => 'Syringe 10ml',
            'unit_id' => $this->unitId,
            'quantity_scale' => 0,
            'state' => 'active',
            'material_version' => 1,
        ]);

        $this->locationId = (string) Str::uuid();
        CatalogueLocation::create([
            'id' => $this->locationId,
            'chapter_id' => $this->chapterId,
            'code' => 'LOC-MAIN',
            'name' => 'Main Stockroom',
            'kind' => 'stockroom',
            'state' => 'active',
            'material_version' => 1,
        ]);
    }

    /** @return array<string, mixed> */
    private function makeIpcLine(string $lineId, string $condition, string $qty): array
    {
        return [
            'line_id' => $lineId,
            'item_id' => $this->itemId,
            'variant_id' => $this->variantId,
            'variant_material_version' => 1,
            'unit_id' => $this->unitId,
            'unit_material_version' => 1,
            'quantity_scale' => 0,
            'historical_variant_label' => 'Syringe 10ml',
            'location_id' => $this->locationId,
            'location_material_version' => 1,
            'regular_custodian_ids' => [$this->counter1Id],
            'condition' => $condition,
            'counted_quantity' => $qty,
            'unit_value' => '25.00',
            'valuation_basis' => 'Documented cost basis',
            'provenance_reference' => 'Sheet S-1',
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

    /**
     * Create, count, and submit an IPC ready for Head + Finance authorization.
     *
     * @return array{ipc_id: string, rm_id: string, line_ids: array{usable: string, damaged: string, rejected: string}, ipc_revision: int}
     */
    private function prepareSubmittedIpc(): array
    {
        $lineUsable = (string) Str::uuid();
        $lineDamaged = (string) Str::uuid();
        $lineRejected = (string) Str::uuid();
        $ipcLines = [
            $this->makeIpcLine($lineUsable, 'usable', '12'),
            $this->makeIpcLine($lineDamaged, 'damaged', '2'),
            $this->makeIpcLine($lineRejected, 'rejected', '1'),
        ];

        $ipcResponse = $this->asBrowserOfficer($this->counter1Id, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs", [
                'material' => [
                    'cutoff_at' => $this->cutoffAt,
                    'informal_movements_suspended' => true,
                    'count_team' => [
                        ['user_id' => $this->counter1Id, 'regular_custodian' => true],
                        ['user_id' => $this->counter2Id, 'regular_custodian' => false],
                    ],
                    'policies' => $this->openingPolicies,
                    'lines' => $ipcLines,
                    'notes' => 'Initial chapter physical inventory count',
                ],
            ]);

        $ipcResponse->assertStatus(201)
            ->assertJsonPath('data.record.state', 'draft')
            ->assertJsonPath('data.record.revision', 1);

        $ipcId = $ipcResponse->json('data.record.id');

        // Prepare draft Opening RM so signed_ipc paper evidence can bind to an existing opening_receipt target
        $rmResponse = $this->asBrowserOfficer($this->counter2Id, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms", [
                'ipc_id' => $ipcId,
                'material' => ['ipc_material_version' => 1, 'lines' => [], 'notes' => null],
            ])->assertStatus(201);
        $rmId = $rmResponse->json('data.record.id');

        $countedAt = now('UTC')->subMinutes(4)->format('Y-m-d\TH:i:s.u\Z');
        $entries = array_map(fn (array $l) => [
            'ipc_line_id' => $l['line_id'],
            'quantity' => $l['counted_quantity'],
            'condition' => $l['condition'],
            'notes' => null,
        ], $ipcLines);

        // Counter 1 & independent Counter 2 record counts
        $this->asBrowserOfficer($this->counter1Id, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 1,
                'material_version' => 1,
                'counted_at' => $countedAt,
                'completed' => true,
                'signed_at' => $countedAt,
                'entries' => $entries,
            ])->assertStatus(200);

        $this->asBrowserOfficer($this->counter2Id, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 2,
                'material_version' => 1,
                'counted_at' => $countedAt,
                'completed' => true,
                'signed_at' => $countedAt,
                'entries' => $entries,
            ])->assertStatus(200);

        [, , $signedIpcBytes] = $this->storeReadyPaperEvidence(
            $this->chapterId,
            $this->counter2Id,
            'opening_receipt',
            $rmId,
            'Signed IPC Count Sheet',
        );

        $submitResponse = $this->asBrowserOfficer($this->counter1Id, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit", [
                'expected_revision' => 3,
                'material_version' => 1,
                'signed_ipc' => $signedIpcBytes,
            ]);

        $submitResponse->assertStatus(200)
            ->assertJsonPath('data.record.state', 'awaiting_authorization');
        $this->assertNotNull($submitResponse->json('data.record.reference'));

        return [
            'ipc_id' => $ipcId,
            'rm_id' => $rmId,
            'line_ids' => ['usable' => $lineUsable, 'damaged' => $lineDamaged, 'rejected' => $lineRejected],
            'ipc_revision' => (int) $submitResponse->json('data.record.revision'),
        ];
    }

    /**
     * Test 1: Full opening baseline lifecycle.
     */
    public function test_full_opening_baseline_lifecycle(): void
    {
        $prep = $this->prepareSubmittedIpc();
        $ipcId = $prep['ipc_id'];
        $rmId = $prep['rm_id'];
        $authAt = now('UTC')->subMinutes(3)->format('Y-m-d\TH:i:s.u\Z');

        // Dual authorization: Chapter Head then Finance Officer
        $headAuth = $this->asBrowserOfficer($this->headUserId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => $prep['ipc_revision'],
                'material_version' => 1,
                'duty' => 'CHAPTER_HEAD',
                'signed_at' => $authAt,
            ]);
        $headAuth->assertStatus(200)
            ->assertJsonPath('data.record.state', 'awaiting_authorization');

        $finAuth = $this->asBrowserOfficer($this->financeUserId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => $headAuth->json('data.record.revision'),
                'material_version' => 1,
                'duty' => 'FINANCE',
                'signed_at' => $authAt,
            ]);
        $finAuth->assertStatus(200)
            ->assertJsonPath('data.record.state', 'authorized');

        // Populate Opening RM inspection lines (12 usable, 2 damaged/quarantine, 1 rejected = 15)
        $replaceRm = $this->asBrowserOfficer($this->counter2Id, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}", [
                'expected_revision' => 1,
                'reason' => 'Populate inspected opening quantities',
                'material' => [
                    'ipc_material_version' => 1,
                    'lines' => [
                        [
                            'ipc_line_id' => $prep['line_ids']['usable'],
                            'accepted_quantity' => '12',
                            'damaged_quantity' => '0',
                            'rejected_quantity' => '0',
                            'accepted_value' => '300.00',
                            'finding_reason' => null,
                        ],
                        [
                            'ipc_line_id' => $prep['line_ids']['damaged'],
                            'accepted_quantity' => '0',
                            'damaged_quantity' => '2',
                            'rejected_quantity' => '0',
                            'accepted_value' => null,
                            'finding_reason' => 'Torn packaging quarantined',
                        ],
                        [
                            'ipc_line_id' => $prep['line_ids']['rejected'],
                            'accepted_quantity' => '0',
                            'damaged_quantity' => '0',
                            'rejected_quantity' => '1',
                            'accepted_value' => null,
                            'finding_reason' => 'Broken seal rejected',
                        ],
                    ],
                    'notes' => 'Opening receiving manifest against IPC',
                ],
            ])->assertStatus(200);

        $inspectRm = $this->asBrowserOfficer($this->counter2Id, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/inspection", [
                'expected_revision' => $replaceRm->json('data.record.revision'),
                'ipc_material_version' => 1,
                'inspected_at' => now('UTC')->subMinutes(2)->format('Y-m-d\TH:i:s.u\Z'),
                'technical_representative_id' => null,
                'inspection_notes' => 'Inspected physical stock at cutoff',
            ]);
        $inspectRm->assertStatus(200)
            ->assertJsonPath('data.record.state', 'inspected');

        [, , $signedRmBytes] = $this->storeReadyPaperEvidence(
            $this->chapterId,
            $this->counter2Id,
            'opening_receipt',
            $rmId,
            'Signed Opening RM',
        );

        $matchRm = $this->asBrowserOfficer($this->counter2Id, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/evidence-match", [
                'expected_revision' => $inspectRm->json('data.record.revision'),
                'material_version' => $inspectRm->json('data.record.material_version'),
                'snapshot_sha256' => $inspectRm->json('data.record.snapshot_sha256'),
                'bytes' => $signedRmBytes,
                'acknowledged_at' => now('UTC')->subMinute()->format('Y-m-d\TH:i:s.u\Z'),
            ]);
        $matchRm->assertStatus(200)
            ->assertJsonPath('data.record.state', 'matched');

        $ackId = $matchRm->json('data.record.acknowledgment.acknowledgment_id');

        $postResponse = $this->asBrowserOfficer($this->counter2Id, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/post", [
                'expected_revision' => $matchRm->json('data.record.revision'),
                'material_version' => $matchRm->json('data.record.material_version'),
                'ipc_material_version' => 1,
                'acknowledgment_id' => $ackId,
            ]);

        $postResponse->assertStatus(200)
            ->assertJsonPath('data.record.state', 'posted');
        $this->assertNotNull($postResponse->json('data.record.reference'));

        $this->assertDatabaseHas('opening_rms', [
            'id' => $rmId,
            'chapter_id' => $this->chapterId,
            'status' => 'POSTED',
        ]);

        $this->assertDatabaseHas('opening_counts', [
            'id' => $ipcId,
            'chapter_id' => $this->chapterId,
            'status' => 'POSTED',
        ]);

        $usableLot = InventoryLot::where('chapter_id', $this->chapterId)
            ->where('variant_id', $this->variantId)
            ->where('condition', 'USABLE')
            ->first();
        $this->assertNotNull($usableLot);
        $this->assertEquals(12.0000, (float) $usableLot->quantity_on_hand);

        $quarantineLot = InventoryLot::where('chapter_id', $this->chapterId)
            ->where('variant_id', $this->variantId)
            ->where('condition', 'QUARANTINE')
            ->first();
        $this->assertNotNull($quarantineLot);
        $this->assertEquals(2.0000, (float) $quarantineLot->quantity_on_hand);

        $rejectedLot = InventoryLot::where('chapter_id', $this->chapterId)
            ->where('variant_id', $this->variantId)
            ->where('condition', 'REJECTED')
            ->first();
        $this->assertNotNull($rejectedLot);
        $this->assertEquals(1.0000, (float) $rejectedLot->quantity_on_hand);

        $baselineResponse = $this->asBrowserOfficer($this->counter1Id)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-baseline");

        $baselineResponse->assertStatus(200)
            ->assertJsonPath('data.rm_id', $rmId);
    }

    /**
     * Test 2: Chapter Singleton Fence.
     * Attempting second postOpeningRm or creating another RM on a posted chapter returns 409.
     */
    public function test_concurrency_and_chapter_singleton_fence(): void
    {
        $this->test_full_opening_baseline_lifecycle();

        $postedRm = OpeningRm::where('chapter_id', $this->chapterId)->where('status', 'POSTED')->firstOrFail();

        // 1. Attempting to re-post with a new action key returns 409 baseline_already_posted
        $this->asBrowserOfficer($this->counter2Id, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$postedRm->id}/post", [
                'expected_revision' => $postedRm->revision,
                'material_version' => $postedRm->material_version,
                'ipc_material_version' => 1,
                'acknowledgment_id' => $postedRm->evidence_binding_id,
            ])->assertStatus(409)
            ->assertJsonPath('error.code', 'baseline_already_posted');

        // 2. Attempting to create a second Opening RM for the posted IPC returns 409 target_locked
        $this->asBrowserOfficer($this->counter2Id, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms", [
                'ipc_id' => $postedRm->ipc_id,
                'material' => ['ipc_material_version' => 1, 'lines' => [], 'notes' => null],
            ])->assertStatus(409)
            ->assertJsonPath('error.code', 'target_locked');
    }

    /**
     * Test 3: Segregation of Duties Gate.
     * Same officer holding both CHAPTER_HEAD and FINANCE cannot fill both authorization slots.
     */
    public function test_segregation_of_duties_gate_rejects_same_person(): void
    {
        DutyGrant::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $this->headUserId,
            'duty_code' => 'FINANCE',
            'status' => 'active',
            'is_alternate' => false,
            'valid_from' => now()->subDay(),
            'limit_php' => '100000.00',
            'version' => 1,
        ]);

        $prep = $this->prepareSubmittedIpc();
        $authAt = now('UTC')->subMinutes(2)->format('Y-m-d\TH:i:s.u\Z');

        $headResponse = $this->asBrowserOfficer($this->headUserId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$prep['ipc_id']}/authorizations", [
                'expected_revision' => $prep['ipc_revision'],
                'material_version' => 1,
                'duty' => 'CHAPTER_HEAD',
                'signed_at' => $authAt,
            ]);
        $headResponse->assertStatus(200);

        // Same officer attempting to sign the FINANCE slot is denied
        $this->asBrowserOfficer($this->headUserId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$prep['ipc_id']}/authorizations", [
                'expected_revision' => $headResponse->json('data.record.revision'),
                'material_version' => 1,
                'duty' => 'FINANCE',
                'signed_at' => $authAt,
            ])->assertStatus(403)
            ->assertJsonPath('error.code', 'duty_denied');
    }

    /**
     * Test 4: Seven Non-Additive Stock Views Reconciliation.
     */
    public function test_seven_non_additive_stock_views_reconciliation(): void
    {
        $this->test_full_opening_baseline_lifecycle();

        $response = $this->asBrowserOfficer($this->counter1Id)
            ->get("/api/v1/chapters/{$this->chapterId}/stock/variants/{$this->variantId}");

        $response->assertStatus(200)
            ->assertJsonPath('data.views_are_additive', false)
            ->assertJsonPath('data.views.usable_stockroom_on_hand.quantity', '12')
            ->assertJsonPath('data.views.quarantined_rejected.quantity', '3')
            ->assertJsonPath('data.views.available_to_allocate.quantity', '12')
            ->assertJsonPath('data.views.rf_reserved.quantity', '0')
            ->assertJsonPath('data.views.so_reserved.quantity', '0')
            ->assertJsonPath('data.views.booth_custody.quantity', '0')
            ->assertJsonPath('data.views.inbound_open_po.quantity', '0');

        /** @var StockViewQueryService $stockService */
        $stockService = app(StockViewQueryService::class);
        $views = $stockService->getSevenViews($this->chapterId, $this->variantId);

        $usable = (float) $views['usable_stockroom_on_hand']['value'];
        $quarantinedRejected = (float) $views['quarantined_rejected']['value'];
        $totalPhysical = $views['total_physical_balance'];

        $this->assertEquals(12.0, $usable);
        $this->assertEquals(3.0, $quarantinedRejected);
        $this->assertEquals(15.0, $totalPhysical);
        $this->assertEquals($totalPhysical, $usable + $quarantinedRejected);
    }

    /**
     * Test 5: Chapter Scoping & Multitenancy.
     */
    public function test_chapter_scoping_and_multitenancy(): void
    {
        $this->test_full_opening_baseline_lifecycle();

        $postedRm = OpeningRm::where('chapter_id', $this->chapterId)->firstOrFail();

        ChapterMembership::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->foreignChapterId,
            'user_id' => $this->counter1Id,
            'membership_status' => 'active',
            'version' => 1,
        ]);
        foreach (['INVENTORY', 'RECEIVING'] as $duty) {
            DutyGrant::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $this->foreignChapterId,
                'user_id' => $this->counter1Id,
                'duty_code' => $duty,
                'status' => 'active',
                'valid_from' => now()->subDay(),
                'version' => 1,
            ]);
        }

        $this->asBrowserOfficer($this->counter1Id)
            ->get("/api/v1/chapters/{$this->foreignChapterId}/ipcs/{$postedRm->ipc_id}")
            ->assertStatus(404);

        $this->asBrowserOfficer($this->counter1Id)
            ->get("/api/v1/chapters/{$this->foreignChapterId}/opening-rms/{$postedRm->id}")
            ->assertStatus(404);

        $this->asBrowserOfficer($this->counter1Id)
            ->get("/api/v1/chapters/{$this->foreignChapterId}/stock/variants/{$this->variantId}")
            ->assertStatus(404);

        $fakeChapterId = (string) Str::uuid();
        $this->asBrowserOfficer($this->counter1Id)
            ->get("/api/v1/chapters/{$fakeChapterId}/stock")
            ->assertStatus(404);
    }
}
