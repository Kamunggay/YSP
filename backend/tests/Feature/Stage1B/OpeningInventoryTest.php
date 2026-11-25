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
use App\Models\OpeningCount;
use App\Models\OpeningRm;
use App\Models\User;
use App\Services\Inventory\StockViewQueryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class OpeningInventoryTest extends TestCase
{
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

    protected function setUp(): void
    {
        parent::setUp();

        $this->chapterId = (string) Str::uuid();
        $this->foreignChapterId = (string) Str::uuid();

        $this->counter1Id = (string) Str::uuid();
        $this->counter2Id = (string) Str::uuid();
        $this->headUserId = (string) Str::uuid();
        $this->financeUserId = (string) Str::uuid();

        // 1. Chapters
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

        // 2. Users
        $users = [
            $this->counter1Id => ['custodian@example.invalid', 'Inventory Custodian'],
            $this->counter2Id => ['reviewer@example.invalid', 'Independent Reviewer'],
            $this->headUserId => ['head@example.invalid', 'Chapter Head'],
            $this->financeUserId => ['finance@example.invalid', 'Finance Officer'],
        ];

        foreach ($users as $id => [$email, $name]) {
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
        }

        // 3. Duty Grants
        $duties = [
            $this->counter1Id => 'INVENTORY_CUSTODIAN',
            $this->counter2Id => 'INDEPENDENT_REVIEWER',
            $this->headUserId => 'CHAPTER_HEAD',
            $this->financeUserId => 'FINANCE',
        ];

        foreach ($duties as $userId => $duty) {
            DutyGrant::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $this->chapterId,
                'user_id' => $userId,
                'duty_code' => $duty,
                'status' => 'active',
                'is_alternate' => false,
                'valid_from' => now()->subDay(),
                'version' => 1,
            ]);
        }

        // 4. Catalogue: Unit, Item, Variant, Location
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

    /**
     * Test 1: Full opening baseline lifecycle.
     * IPC creation -> 2-person independent counts -> submit -> dual authorization (Head + Finance)
     * -> Opening RM creation -> inspect -> match evidence -> postOpeningRm atomic commit
     * -> verify lots created, balance recorded, status = POSTED.
     */
    public function test_full_opening_baseline_lifecycle(): void
    {
        // 1. Create IPC in DRAFT
        $ipcResponse = $this->withHeaders(['X-User-Id' => $this->counter1Id])
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs", [
                'notes' => 'Initial chapter physical inventory count',
            ]);

        $ipcResponse->assertStatus(201)
            ->assertJsonPath('data.status', 'DRAFT')
            ->assertJsonPath('data.revision', 1);

        $ipcId = $ipcResponse->json('data.id');

        // 2. Counter 1 saves count
        $count1Response = $this->withHeaders(['X-User-Id' => $this->counter1Id])
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'lines' => [
                    [
                        'variant_id' => $this->variantId,
                        'unit_id' => $this->unitId,
                        'location_id' => $this->locationId,
                        'condition' => 'USABLE',
                        'counted_quantity' => 15,
                    ],
                ],
            ]);
        $count1Response->assertStatus(200)
            ->assertJsonCount(1, 'data.lines');

        // 3. Counter 2 saves independent count
        $count2Response = $this->withHeaders(['X-User-Id' => $this->counter2Id])
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'lines' => [
                    [
                        'variant_id' => $this->variantId,
                        'unit_id' => $this->unitId,
                        'location_id' => $this->locationId,
                        'condition' => 'USABLE',
                        'counted_quantity' => 15,
                    ],
                ],
            ]);
        $count2Response->assertStatus(200);

        // 4. Submit IPC -> status = AWAITING_AUTHORIZATION
        $submitResponse = $this->withHeaders(['X-User-Id' => $this->counter1Id])
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit");

        $submitResponse->assertStatus(200)
            ->assertJsonPath('data.status', 'AWAITING_AUTHORIZATION');
        $this->assertNotNull($submitResponse->json('data.ipc_number'));

        // 5. Dual Authorization
        // 5a. Chapter Head signs
        $headAuthResponse = $this->withHeaders(['X-User-Id' => $this->headUserId])
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'role' => 'HEAD',
            ]);
        $headAuthResponse->assertStatus(200)
            ->assertJsonPath('data.status', 'AWAITING_AUTHORIZATION'); // still awaiting finance

        // 5b. Finance Officer signs
        $financeAuthResponse = $this->withHeaders(['X-User-Id' => $this->financeUserId])
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'role' => 'FINANCE',
            ]);
        $financeAuthResponse->assertStatus(200)
            ->assertJsonPath('data.status', 'AUTHORIZED');

        // 6. Create Opening RM
        $createRmResponse = $this->withHeaders(['X-User-Id' => $this->counter2Id])
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms", [
                'ipc_id' => $ipcId,
                'notes' => 'Opening receiving manifest against IPC',
            ]);
        $createRmResponse->assertStatus(201)
            ->assertJsonPath('data.status', 'DRAFT');

        $rmId = $createRmResponse->json('data.id');

        // 7. Inspect Opening RM (12 usable, 2 quarantined, 1 rejected = 15 total)
        $inspectResponse = $this->withHeaders(['X-User-Id' => $this->counter2Id])
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/inspection", [
                'lines' => [
                    [
                        'variant_id' => $this->variantId,
                        'unit_id' => $this->unitId,
                        'location_id' => $this->locationId,
                        'accepted_quantity' => 12,
                        'damaged_quantity' => 2,
                        'rejected_quantity' => 1,
                        'accepted_value' => '300.00',
                    ],
                ],
                'inspection_notes' => 'Inspected physical stock at cutoff',
            ]);
        $inspectResponse->assertStatus(200)
            ->assertJsonPath('data.status', 'INSPECTED');

        // 8. Match Opening RM Evidence
        $matchResponse = $this->withHeaders(['X-User-Id' => $this->counter2Id])
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/evidence-match", [
                'evidence_binding_id' => 'BIND-EVID-OPENING-001',
            ]);
        $matchResponse->assertStatus(200)
            ->assertJsonPath('data.status', 'EVIDENCE_MATCHED');

        // 9. Atomic postOpeningRm commit
        $postResponse = $this->withHeaders(['X-User-Id' => $this->counter2Id])
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/post");

        $postResponse->assertStatus(200)
            ->assertJsonPath('data.record.status', 'POSTED');
        $this->assertNotNull($postResponse->json('data.record.rm_number'));

        // Verify Database State
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

        $this->assertDatabaseHas('inventory_postings', [
            'chapter_id' => $this->chapterId,
            'source_type' => 'IPC',
            'source_id' => $rmId,
        ]);

        // Verify Lots Created
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

        // Verify opening baseline read
        $baselineResponse = $this->withHeaders(['X-User-Id' => $this->counter1Id])
            ->getJson("/api/v1/chapters/{$this->chapterId}/opening-baseline");

        $baselineResponse->assertStatus(200)
            ->assertJsonPath('data.baseline.id', $rmId)
            ->assertJsonPath('data.baseline.status', 'POSTED');
    }

    /**
     * Test 2: Concurrency & Chapter Singleton Fence.
     * Attempting second postOpeningRm for same chapter returns 409 Conflict (RCV-10, T-18, A-18).
     */
    public function test_concurrency_and_chapter_singleton_fence(): void
    {
        // Set up and post baseline
        $this->test_full_opening_baseline_lifecycle();

        $postedRm = OpeningRm::where('chapter_id', $this->chapterId)->where('status', 'POSTED')->first();
        $this->assertNotNull($postedRm);

        // 1. Attempting to re-post the same already-posted RM returns 409
        $retryResponse = $this->withHeaders(['X-User-Id' => $this->counter2Id])
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$postedRm->id}/post");

        $retryResponse->assertStatus(409)
            ->assertJsonPath('error', 'BASELINE_ALREADY_POSTED');

        // 2. Attempting to create or post a second Opening RM for this chapter returns 409
        $secondRmResponse = $this->withHeaders(['X-User-Id' => $this->counter2Id])
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms", [
                'ipc_id' => $postedRm->ipc_id,
            ]);

        $secondRmResponse->assertStatus(409)
            ->assertJsonPath('error', 'BASELINE_ALREADY_POSTED');
    }

    /**
     * Test 3: Segregation of Duties Gate.
     * Attempting dual authorization where Head and Finance are same person returns 422 (GOV-05, GOV-06).
     */
    public function test_segregation_of_duties_gate_rejects_same_person(): void
    {
        // Create and submit IPC
        $ipc = OpeningCount::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'status' => 'AWAITING_AUTHORIZATION',
            'ipc_number' => 'IPC-20261103-TEST01',
            'revision' => 2,
            'material_version' => 1,
            'created_by' => $this->counter1Id,
        ]);

        // Chapter Head authorizes first
        $headResponse = $this->withHeaders(['X-User-Id' => $this->headUserId])
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipc->id}/authorizations", [
                'role' => 'HEAD',
            ]);
        $headResponse->assertStatus(200);

        // Same person attempts to authorize as Finance -> must return 422
        $financeSamePersonResponse = $this->withHeaders(['X-User-Id' => $this->headUserId])
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipc->id}/authorizations", [
                'role' => 'FINANCE',
            ]);

        $financeSamePersonResponse->assertStatus(422)
            ->assertJsonPath('error', 'SEGREGATION_OF_DUTIES_VIOLATION');

        // Attempting direct dual payload with same user ID in both slots -> returns 422
        $directDualSameResponse = $this->withHeaders(['X-User-Id' => $this->headUserId])
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipc->id}/authorizations", [
                'authorized_head_by' => $this->headUserId,
                'authorized_finance_by' => $this->headUserId,
            ]);

        $directDualSameResponse->assertStatus(422)
            ->assertJsonPath('error', 'SEGREGATION_OF_DUTIES_VIOLATION');
    }

    /**
     * Test 4: Seven Non-Additive Stock Views Reconciliation.
     * Verify usable + quarantine + rejected = counted physical balance.
     */
    public function test_seven_non_additive_stock_views_reconciliation(): void
    {
        // Run full lifecycle which produces 12 usable, 2 quarantine, 1 rejected = 15 total
        $this->test_full_opening_baseline_lifecycle();

        // Query stock summaries via API
        $response = $this->withHeaders(['X-User-Id' => $this->counter1Id])
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/variants/{$this->variantId}");

        $response->assertStatus(200)
            ->assertJsonPath('data.views_are_additive', false)
            ->assertJsonPath('data.views.usable_stockroom_on_hand.quantity', '12')
            ->assertJsonPath('data.views.quarantined_rejected.quantity', '3')
            ->assertJsonPath('data.views.available_to_allocate.quantity', '12')
            ->assertJsonPath('data.views.rf_reserved.quantity', '0')
            ->assertJsonPath('data.views.so_reserved.quantity', '0')
            ->assertJsonPath('data.views.booth_custody.quantity', '0')
            ->assertJsonPath('data.views.inbound_open_po.quantity', '0');

        // Verify service level reconciliation
        /** @var StockViewQueryService $stockService */
        $stockService = app(StockViewQueryService::class);
        $views = $stockService->getSevenViews($this->chapterId, $this->variantId);

        $usable = (float) $views['usable_stockroom_on_hand']['value'];
        $quarantinedRejected = (float) $views['quarantined_rejected']['value'];
        $totalPhysical = $views['total_physical_balance'];

        $this->assertEquals(12.0, $usable);
        $this->assertEquals(3.0, $quarantinedRejected);
        $this->assertEquals(15.0, $totalPhysical);

        // Core Invariant: sum of non-additive components equals physical balance
        $this->assertEquals($totalPhysical, $usable + $quarantinedRejected);
    }

    /**
     * Test 5: Chapter Scoping & Multitenancy.
     * Cross-chapter requests return 404.
     */
    public function test_chapter_scoping_and_multitenancy(): void
    {
        $this->test_full_opening_baseline_lifecycle();

        $postedRm = OpeningRm::where('chapter_id', $this->chapterId)->first();
        $this->assertNotNull($postedRm);

        // Grant counter1 active membership in foreign chapter so they can query foreign chapter context
        ChapterMembership::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->foreignChapterId,
            'user_id' => $this->counter1Id,
            'membership_status' => 'active',
            'version' => 1,
        ]);

        // 1. Cross-chapter query for IPC from foreign chapter -> 404
        $crossIpcResponse = $this->withHeaders(['X-User-Id' => $this->counter1Id])
            ->getJson("/api/v1/chapters/{$this->foreignChapterId}/ipcs/{$postedRm->ipc_id}");
        $crossIpcResponse->assertStatus(404);

        // 2. Cross-chapter query for RM from foreign chapter -> 404
        $crossRmResponse = $this->withHeaders(['X-User-Id' => $this->counter1Id])
            ->getJson("/api/v1/chapters/{$this->foreignChapterId}/opening-rms/{$postedRm->id}");
        $crossRmResponse->assertStatus(404);

        // 3. Cross-chapter query for variant stock from foreign chapter -> 404
        $crossStockResponse = $this->withHeaders(['X-User-Id' => $this->counter1Id])
            ->getJson("/api/v1/chapters/{$this->foreignChapterId}/stock/variants/{$this->variantId}");
        $crossStockResponse->assertStatus(404);

        // 4. Totally non-existent chapter UUID -> 404
        $fakeChapterId = (string) Str::uuid();
        $fakeChapterResponse = $this->withHeaders(['X-User-Id' => $this->counter1Id])
            ->getJson("/api/v1/chapters/{$fakeChapterId}/stock");
        $fakeChapterResponse->assertStatus(404);
    }
}
