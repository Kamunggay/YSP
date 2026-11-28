<?php

declare(strict_types=1);

namespace Tests\Feature\Stage2;

use App\Models\AuditLog;
use App\Models\BrowserSession;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\InternalRf;
use App\Models\InternalRfLine;
use App\Models\InventoryLot;
use App\Models\PolicyRecord;
use App\Models\RfReservationAllocation;
use App\Models\StockHold;
use App\Models\StockHoldRange;
use App\Models\StockReservation;
use App\Models\User;
use App\Services\Inventory\Participants\NetShortageSnapshotParticipant;
use App\Services\Inventory\Participants\OpenProcurementSupplyProvider;
use App\Services\Shared\CanonicalJson;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class Stage2ABackendQueriesTest extends TestCase
{
    use RefreshDatabase;

    private string $chapterId;

    private string $userId;

    private string $chapterHeadId;

    private string $unitAId;

    private string $unitBId;

    private string $locationId;

    private string $unitEachId;

    private FakeProcurementSupplyProvider $fakeSupply;

    protected function setUp(): void
    {
        parent::setUp();

        $this->chapterId = (string) Str::uuid();
        $this->userId = (string) Str::uuid();
        $this->chapterHeadId = (string) Str::uuid();
        $this->unitAId = (string) Str::uuid();
        $this->unitBId = (string) Str::uuid();
        $this->locationId = (string) Str::uuid();
        $this->unitEachId = (string) Str::uuid();

        $this->fakeSupply = new FakeProcurementSupplyProvider;
        $this->app->instance(OpenProcurementSupplyProvider::class, $this->fakeSupply);

        Chapter::create([
            'id' => $this->chapterId,
            'code' => 'CEB-2A',
            'name' => 'Cebu Chapter Stage 2A',
            'status' => 'live',
            'version' => 1,
        ]);

        foreach ([[$this->userId, 'officer@example.invalid', 'Glenn Officer'], [$this->chapterHeadId, 'head@example.invalid', 'Chapter Head']] as [$id, $email, $name]) {
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

        foreach (['INVENTORY', 'DISPATCH', 'PURCHASING'] as $duty) {
            DutyGrant::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $this->chapterId,
                'user_id' => $this->userId,
                'duty_code' => $duty,
                'status' => 'active',
                'is_alternate' => false,
                'valid_from' => now()->subDay(),
                'version' => 1,
            ]);
        }

        DutyGrant::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $this->chapterHeadId,
            'duty_code' => 'CHAPTER_HEAD',
            'status' => 'active',
            'is_alternate' => false,
            'valid_from' => now()->subDay(),
            'version' => 1,
        ]);

        DB::table('chapter_organizational_units')->insert([
            [
                'id' => $this->unitAId,
                'chapter_id' => $this->chapterId,
                'ended_at' => null,
            ],
            [
                'id' => $this->unitBId,
                'chapter_id' => $this->chapterId,
                'ended_at' => null,
            ],
        ]);

        CatalogueLocation::create([
            'id' => $this->locationId,
            'chapter_id' => $this->chapterId,
            'code' => 'MAIN-WH',
            'name' => 'Main Stockroom',
            'kind' => 'stockroom',
            'is_active' => true,
            'state' => 'active',
            'material_version' => 1,
        ]);

        CatalogueUnit::create([
            'id' => $this->unitEachId,
            'chapter_id' => $this->chapterId,
            'code' => 'PCS',
            'name' => 'Pieces',
            'quantity_kind' => 'piece',
            'quantity_scale' => 0,
            'quantity_identity_locked' => true,
            'state' => 'active',
            'material_version' => 1,
        ]);
    }

    public function test_net_shortage_math_inbound_waterfall_and_stock_inbound_open_po(): void
    {
        [$itemId, $variantId] = $this->seedItemAndVariant('SHIRT', 'SHIRT-M', 'Chapter Shirt', 'Medium');
        $this->seedPolicy('quantity_scale', $variantId, 'CatalogueQuantityPolicyValue', [
            'unit_id' => $this->unitEachId,
            'quantity_kind' => 'piece',
            'quantity_scale' => 0,
        ]);
        $ropPolicyId = $this->seedPolicy('rop', $itemId, 'CatalogueThresholdPolicyValue', [
            'unit_id' => $this->unitEachId,
            'quantity' => '25',
        ]);
        $targetPolicyId = $this->seedPolicy('target_level', $itemId, 'CatalogueThresholdPolicyValue', [
            'unit_id' => $this->unitEachId,
            'quantity' => '50',
        ]);
        $this->seedPolicy('allocation_priority', null, 'AllocationPriorityPolicyValue', [
            'priorities' => [
                ['requesting_unit_id' => $this->unitAId, 'rank' => 1],
                ['requesting_unit_id' => $this->unitBId, 'rank' => 2],
            ],
            'overrides' => [],
        ]);

        // Usable stockroom lot: 25 units (holds=3, active reservation=4 => eligible unheld=22, avail=18)
        $lotId = $this->createLot($variantId, '25', 'unrestricted', [], 'PO_DR', 'RM-PO-001');
        $hold = StockHold::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'version' => 1,
            'reason_code' => 'damage_inspection',
            'reason' => 'Damaged corner cartons',
            'status' => 'active',
            'placed_by_user_id' => $this->userId,
        ]);
        StockHoldRange::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'hold_id' => $hold->id,
            'lot_id' => $lotId,
            'basis_segment_id' => $lotId,
            'offset_quantity' => 0,
            'quantity' => 3,
        ]);

        // Approved RF needing 30 total: 4 reserved + 26 unreserved
        // Net math: usable=25 (<= ROP 25 => breach!), eligible_unheld=22, active_res=4 -> eligible_avail=18
        // unreserved_demand=26 -> RF shortage = 26 - 18 = 8
        // net_post_rf_position = 22 - 4 - 26 = -8 -> clamped 0 -> gross_rop = 50 -> gross_combined = 58
        [$rfId, $rfLineId] = $this->createApprovedRf($this->unitAId, $variantId, '30', '4');
        $resv = StockReservation::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'source_type' => 'RF',
            'source_id' => $rfId,
            'source_line_id' => $rfLineId,
            'rf_line_id' => $rfLineId,
            'lot_id' => $lotId,
            'version' => 1,
            'material_version' => 1,
            'quantity' => 4,
            'committed_quantity' => 4,
            'active_quantity' => 4,
            'fulfilled_quantity' => 0,
            'released_quantity' => 0,
            'blocked_quantity' => 0,
            'status' => 'ACTIVE',
            'state' => 'ACTIVE',
            'created_by_user_id' => $this->userId,
        ]);
        RfReservationAllocation::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'reservation_id' => $resv->id,
            'lot_id' => $lotId,
            'basis_segment_id' => $lotId,
            'offset_quantity' => 3,
            'quantity' => 4,
            'consumed_quantity' => 0,
            'released_quantity' => 0,
            'status' => 'active',
        ]);

        // Inbound: PO ordered 100 / accepted 40 => open PO 60 counted + RepF 5 counted + disputed PO 12 excluded
        $repfExcludedId = (string) Str::uuid();
        $this->fakeSupply->sources = [
            [
                'variant_id' => $variantId,
                'unit_id' => $this->unitEachId,
                'source_kind' => 'po',
                'source_id' => (string) Str::uuid(),
                'source_reference' => 'CEB-PO-2026-0001',
                'status' => 'partially_received',
                'open_quantity' => '60.000000',
                'coverage_state' => 'counted',
                'exclusion_reason' => null,
            ],
            [
                'variant_id' => $variantId,
                'unit_id' => $this->unitEachId,
                'source_kind' => 'repf',
                'source_id' => $repfExcludedId,
                'source_reference' => 'CEB-REPF-2026-0001',
                'status' => 'approved',
                'open_quantity' => '5.000000',
                'coverage_state' => 'counted',
                'exclusion_reason' => null,
            ],
            [
                'variant_id' => $variantId,
                'unit_id' => $this->unitEachId,
                'source_kind' => 'po',
                'source_id' => (string) Str::uuid(),
                'source_reference' => 'CEB-PO-2026-0002',
                'status' => 'partially_received',
                'open_quantity' => '12.000000',
                'coverage_state' => 'disputed',
                'exclusion_reason' => 'Open receiving discrepancy.',
            ],
        ];

        $response = $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/replenishment/needs?trigger_filter=all");

        $response->assertStatus(200)
            ->assertHeader('Cache-Control', 'no-store')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.rop_policy.policy_id', $ropPolicyId)
            ->assertJsonPath('data.0.target_level_policy.policy_id', $targetPolicyId)
            ->assertJsonPath('data.0.usable_stockroom_on_hand', '25')
            ->assertJsonPath('data.0.eligible_usable_stockroom_on_hand', '22')
            ->assertJsonPath('data.0.active_rf_reservations', '4')
            ->assertJsonPath('data.0.eligible_available_to_allocate', '18')
            ->assertJsonPath('data.0.total_unreserved_approved_rf_demand', '26')
            ->assertJsonPath('data.0.unreserved_approved_rf_shortage', '8')
            ->assertJsonPath('data.0.open_repf_quantity', '5')
            ->assertJsonPath('data.0.open_po_inbound_quantity', '60')
            ->assertJsonPath('data.0.total_open_inbound_coverage', '65')
            ->assertJsonPath('data.0.excluded_inbound_quantity', '12')
            ->assertJsonPath('data.0.low_stock_breach', true)
            ->assertJsonPath('data.0.gross_rf_shortage_need', '8')
            ->assertJsonPath('data.0.gross_rop_replenishment_need', '50')
            ->assertJsonPath('data.0.gross_combined_need', '58')
            ->assertJsonPath('data.0.uncovered_rf_shortage_quantity', '0')
            ->assertJsonPath('data.0.uncovered_rop_replenishment_quantity', '0')
            ->assertJsonPath('data.0.proposed_uncovered_quantity', '0')
            ->assertJsonCount(1, 'data.0.contributing_rf_lines')
            ->assertJsonCount(3, 'data.0.inbound_sources');

        // Verify Stage 1 /stock projects live inbound_open_po (= 72 across open/partially_received POs: 60 + 12)
        // without changing usable_stockroom_on_hand (25) or available_to_allocate (22)!
        $stockResponse = $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/variants/{$variantId}");

        $stockResponse->assertStatus(200)
            ->assertJsonPath('data.views.usable_stockroom_on_hand.quantity', '25')
            ->assertJsonPath('data.views.inbound_open_po.quantity', '72');

        // Verify synchronous NetShortageSnapshotParticipant respects exclude_repf_id and include_rf_line_breakdown=false
        /** @var NetShortageSnapshotParticipant $participant */
        $participant = $this->app->make(NetShortageSnapshotParticipant::class);
        $snap = $participant->computeNetShortageSnapshot([
            'chapter_id' => $this->chapterId,
            'actor_id' => $this->userId,
            'observed_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
            'variant_ids' => [$variantId],
            'include_rf_line_breakdown' => false,
            'require_rop_and_target_policies' => true,
            'exclude_repf_id' => $repfExcludedId,
        ]);

        $this->assertSame('ready', $snap['outcome']);
        $this->assertSame('0', $snap['items'][0]['open_repf_quantity']);
        $this->assertSame('60', $snap['items'][0]['open_po_inbound_quantity']);
        $this->assertSame([], $snap['items'][0]['contributing_rf_lines']);
    }

    public function test_restricted_unit_a_vs_unit_b_shortage_split_and_allocation_queue_segregation(): void
    {
        [$itemId, $variantId] = $this->seedItemAndVariant('WATER', 'WATER-500', 'Bottled Water', '500ml');
        $this->seedPolicy('quantity_scale', $variantId, 'CatalogueQuantityPolicyValue', [
            'unit_id' => $this->unitEachId,
            'quantity_kind' => 'piece',
            'quantity_scale' => 0,
        ]);
        $this->seedPolicy('allocation_priority', null, 'AllocationPriorityPolicyValue', [
            'priorities' => [
                ['requesting_unit_id' => $this->unitAId, 'rank' => 1],
                ['requesting_unit_id' => $this->unitBId, 'rank' => 2],
            ],
            'overrides' => [],
        ]);

        // All 10 free units are strictly bounded to Unit A only (no ROP breach, no inbound coverage)
        $unitALotId = $this->createLot($variantId, '10', 'bounded', [
            'allowed_uses' => ['internal_use'],
            'event_ids' => [],
            'requesting_unit_ids' => [$this->unitAId],
            'effective_from' => now()->subDay()->utc()->format('Y-m-d\TH:i:s.u\Z'),
            'effective_until' => now()->addMonth()->utc()->format('Y-m-d\TH:i:s.u\Z'),
            'interpretation_id' => (string) Str::uuid(),
            'source_condition_reference' => 'DONOR-UNIT-A-ONLY',
        ], 'DA', 'RM-DA-001');

        // Plus an uninterpreted DA lot (5 units) -> never eligible for anyone
        $uninterpretedLotId = $this->createLot($variantId, '5', 'uninterpreted', [], 'DA', 'RM-DA-002');

        // Unit A approved RF needs 2; Unit B approved RF needs 8
        [$rfAId, $rfALineId] = $this->createApprovedRf($this->unitAId, $variantId, '2');
        [$rfBId, $rfBLineId] = $this->createApprovedRf($this->unitBId, $variantId, '8');

        // Check Net Shortage: 2 units cover Unit A; remaining 8 cannot cover Unit B => shortage 8, proposed uncovered 8!
        $needs = $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/replenishment/needs");

        $needs->assertStatus(200)
            ->assertJsonPath('data.0.usable_stockroom_on_hand', '15')
            ->assertJsonPath('data.0.eligible_usable_stockroom_on_hand', '10')
            ->assertJsonPath('data.0.total_unreserved_approved_rf_demand', '10')
            ->assertJsonPath('data.0.unreserved_approved_rf_shortage', '8')
            ->assertJsonPath('data.0.proposed_uncovered_quantity', '8');

        // Allocation queue: Unit A sees 10 eligible bounded units; Unit B sees 0 eligible (15 ineligible incl. 5 uninterpreted)
        $queue = $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/allocation-queue");

        $queue->assertStatus(200)
            ->assertJsonPath('is_commit_authorization', false)
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.rf_id', $rfAId)
            ->assertJsonPath('data.0.eligible_available_quantity', '10')
            ->assertJsonPath('data.0.uninterpreted_restricted_quantity', '5')
            ->assertJsonPath('data.0.ineligible_restricted_quantity', '5')
            ->assertJsonPath('data.0.eligible_sources.0.stock_lot_id', $unitALotId)
            ->assertJsonPath('data.0.eligible_sources.0.restriction_state', 'bounded')
            ->assertJsonPath('data.1.rf_id', $rfBId)
            ->assertJsonPath('data.1.eligible_available_quantity', '0')
            ->assertJsonPath('data.1.uninterpreted_restricted_quantity', '5')
            ->assertJsonPath('data.1.ineligible_restricted_quantity', '15')
            ->assertJsonCount(0, 'data.1.eligible_sources');

        // eligible_only=true excludes Unit B cleanly
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/allocation-queue?eligible_only=true")
            ->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.rf_id', $rfAId);

        // Stage 1 allocation review for Unit B excludes BOTH Unit A lot and uninterpreted lot
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfBId}/allocation-review")
            ->assertStatus(200)
            ->assertJsonCount(0, 'data.lines.0.candidate_lots');

        // Stage 1 allocation review for Unit A shows Unit A lot only (not uninterpreted lot)
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfAId}/allocation-review")
            ->assertStatus(200)
            ->assertJsonCount(1, 'data.lines.0.candidate_lots')
            ->assertJsonPath('data.lines.0.candidate_lots.0.stock_lot_id', $unitALotId);

        // Stage 1 lot eligibility flags uninterpreted lot as ineligible and distinguishes internal_use vs sale eligibility
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/lots/{$uninterpretedLotId}/eligibility")
            ->assertStatus(200)
            ->assertJsonPath('data.eligible', false)
            ->assertJsonPath('data.internal_use_eligible', false)
            ->assertJsonPath('data.sale_eligible', false)
            ->assertJsonPath('data.uninterpreted_restricted_quantity', '5');

        // Same-SKU unrestricted lot allows both RF internal use & sale; internal_use-only lot excludes sale eligibility
        $unrestrictedSameSkuLotId = $this->createLot($variantId, '6', 'unrestricted', [], 'IPC', 'RM-IPC-UNRES');
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/lots/{$unitALotId}/eligibility")
            ->assertStatus(200)
            ->assertJsonPath('data.eligible', true)
            ->assertJsonPath('data.internal_use_eligible', true)
            ->assertJsonPath('data.sale_eligible', false);

        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/lots/{$unitALotId}/eligibility?intended_use=sale")
            ->assertStatus(200)
            ->assertJsonPath('data.eligible', false)
            ->assertJsonPath('data.sale_eligible', false);

        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/lots/{$unrestrictedSameSkuLotId}/eligibility?intended_use=sale")
            ->assertStatus(200)
            ->assertJsonPath('data.eligible', true)
            ->assertJsonPath('data.sale_eligible', true);

        // Direct Stage 1 reservation commit against wrong-unit or uninterpreted lot is rejected (409 stock_ineligible)
        $prepWrongUnit = $this->asOfficer($this->userId)
            ->withHeader('X-Action-Key', (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfBId}/reservation-preparations", [
                'expected_rf_version' => 1,
                'expected_rf_material_version' => 1,
                'expected_rf_progress_version' => 1,
                'rf_line_id' => $rfBLineId,
                'targets' => [[
                    'stock_lot_id' => $unitALotId,
                    'basis_segment_id' => $unitALotId,
                    'offset_quantity' => '0',
                    'quantity' => '2',
                    'expected_lot_material_version' => 1,
                    'expected_stock_version' => 1,
                ]],
            ]);
        $prepWrongUnit->assertStatus(201);
        $wrongPrepId = (string) $prepWrongUnit->json('data.resource_id');
        $this->asOfficer($this->userId)
            ->withHeader('X-Action-Key', (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfBId}/reservation-preparations/{$wrongPrepId}/commit", [
                'expected_rf_version' => 1,
                'expected_rf_material_version' => 1,
                'expected_rf_progress_version' => 1,
                'expected_preparation_version' => 1,
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'stock_ineligible');

        $prepUninterpreted = $this->asOfficer($this->userId)
            ->withHeader('X-Action-Key', (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfAId}/reservation-preparations", [
                'expected_rf_version' => 1,
                'expected_rf_material_version' => 1,
                'expected_rf_progress_version' => 1,
                'rf_line_id' => $rfALineId,
                'targets' => [[
                    'stock_lot_id' => $uninterpretedLotId,
                    'basis_segment_id' => $uninterpretedLotId,
                    'offset_quantity' => '0',
                    'quantity' => '1',
                    'expected_lot_material_version' => 1,
                    'expected_stock_version' => 1,
                ]],
            ]);
        $prepUninterpreted->assertStatus(201);
        $unintPrepId = (string) $prepUninterpreted->json('data.resource_id');
        $this->asOfficer($this->userId)
            ->withHeader('X-Action-Key', (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfAId}/reservation-preparations/{$unintPrepId}/commit", [
                'expected_rf_version' => 1,
                'expected_rf_material_version' => 1,
                'expected_rf_progress_version' => 1,
                'expected_preparation_version' => 1,
            ])
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'stock_ineligible');
    }

    public function test_inv09_allocation_queue_tiering_override_tie_break_and_pagination_staleness(): void
    {
        [, $variantId] = $this->seedItemAndVariant('RICE', 'RICE-5K', 'Rice Pack', '5kg');
        $this->seedPolicy('quantity_scale', $variantId, 'CatalogueQuantityPolicyValue', [
            'unit_id' => $this->unitEachId,
            'quantity_kind' => 'piece',
            'quantity_scale' => 0,
        ]);

        [$rfCommitId, $rfCommitLineId] = $this->createApprovedRf($this->unitBId, $variantId, '10', '2', '2026-12-05T08:00:00Z', '2026-11-26T09:00:00Z');
        [$rfOverrideId, $rfOverrideLineId] = $this->createApprovedRf($this->unitBId, $variantId, '6', '0', '2026-12-06T08:00:00Z', '2026-11-26T10:00:00Z');
        [$rfStdOlderId, $rfStdOlderLineId] = $this->createApprovedRf($this->unitAId, $variantId, '5', '0', '2026-12-01T08:00:00Z', '2026-11-25T08:00:00Z');
        [$rfStdNewerId, $rfStdNewerLineId] = $this->createApprovedRf($this->unitAId, $variantId, '4', '0', '2026-12-01T08:00:00Z', '2026-11-25T12:00:00Z');

        $lotId = $this->createLot($variantId, '20', 'unrestricted', [], 'IPC', 'RM-IPC-001');
        StockReservation::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'source_type' => 'RF',
            'source_id' => $rfCommitId,
            'source_line_id' => $rfCommitLineId,
            'rf_line_id' => $rfCommitLineId,
            'lot_id' => $lotId,
            'version' => 1,
            'material_version' => 1,
            'quantity' => 2,
            'committed_quantity' => 2,
            'active_quantity' => 2,
            'fulfilled_quantity' => 0,
            'released_quantity' => 0,
            'blocked_quantity' => 0,
            'status' => 'ACTIVE',
            'state' => 'ACTIVE',
            'created_by_user_id' => $this->userId,
        ]);

        $overridePolicyId = $this->seedPolicy('allocation_priority', null, 'AllocationPriorityPolicyValue', [
            'priorities' => [
                ['requesting_unit_id' => $this->unitAId, 'rank' => 1],
                ['requesting_unit_id' => $this->unitBId, 'rank' => 5],
            ],
            'overrides' => [[
                'rf_id' => $rfOverrideId,
                'rf_line_id' => $rfOverrideLineId,
                'selection_sha256' => str_repeat('a', 64),
                'reason' => 'Urgent disaster response',
                'expires_at' => now()->addDay()->utc()->format('Y-m-d\TH:i:s.u\Z'),
            ]],
        ]);

        $page1 = $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/allocation-queue?limit=2");

        $page1->assertStatus(200)
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.queue_position', 1)
            ->assertJsonPath('data.0.allocation_tier', 'active_commitment')
            ->assertJsonPath('data.0.rf_line_id', $rfCommitLineId)
            ->assertJsonPath('data.1.queue_position', 2)
            ->assertJsonPath('data.1.allocation_tier', 'approved_override')
            ->assertJsonPath('data.1.override_policy_id', $overridePolicyId)
            ->assertJsonPath('data.1.rf_line_id', $rfOverrideLineId);

        $cursor = $page1->json('page.next_cursor');
        $this->assertNotNull($cursor);

        // Fetch page 2 -> tie-broken standard priority
        $page2 = $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/allocation-queue?limit=2&cursor=".urlencode($cursor));

        $page2->assertStatus(200)
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.rf_line_id', $rfStdOlderLineId)
            ->assertJsonPath('data.1.rf_line_id', $rfStdNewerLineId)
            ->assertJsonPath('page.next_cursor', null);

        // Mutate stock version -> previous cursor must return 409 snapshot_stale
        InventoryLot::whereKey($lotId)->increment('stock_version');
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/allocation-queue?limit=2&cursor=".urlencode($cursor))
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'snapshot_stale');
    }

    public function test_error_contracts_selectors_setup_blocked_and_duties(): void
    {
        [$itemId, $variantId] = $this->seedItemAndVariant('KIT', 'KIT-1', 'First Aid Kit', 'Standard');
        $this->seedPolicy('quantity_scale', $variantId, 'CatalogueQuantityPolicyValue', [
            'unit_id' => $this->unitEachId,
            'quantity_kind' => 'piece',
            'quantity_scale' => 0,
        ]);

        // Stage 3 selector so_shortage must return 400 invalid_selector
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/replenishment/needs?trigger_filter=so_shortage")
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'invalid_selector');

        // Unknown variant_id -> 404 resource_not_found
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/replenishment/needs?variant_id=".(string) Str::uuid())
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'resource_not_found');

        // Explicit rop_breach without rop/target policies -> 409 setup_blocked naming item
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/replenishment/needs?item_id={$itemId}&trigger_filter=rop_breach")
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'setup_blocked')
            ->assertJsonPath('error.blockers.0.subject_id', $itemId);

        // Allocation queue without allocation_priority -> 409 setup_blocked
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/allocation-queue")
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'setup_blocked')
            ->assertJsonPath('error.blockers.0.setting_key', 'allocation_priority');

        // Unauthorized duty -> 403 duty_denied
        $salesUser = (string) Str::uuid();
        User::create([
            'id' => $salesUser,
            'public_id' => 'sales2a@example.invalid',
            'name' => 'Sales Officer',
            'email' => 'sales2a@example.invalid',
            'password_hash' => hash('sha256', 'Password123!'),
            'status' => 'active',
            'version' => 1,
        ]);
        ChapterMembership::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $salesUser,
            'membership_status' => 'active',
            'version' => 1,
        ]);
        DutyGrant::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $salesUser,
            'duty_code' => 'SALES_OFFICER',
            'status' => 'active',
            'is_alternate' => false,
            'valid_from' => now()->subDay(),
            'version' => 1,
        ]);

        $this->asOfficer($salesUser)
            ->getJson("/api/v1/chapters/{$this->chapterId}/replenishment/needs")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'duty_denied');
        $this->asOfficer($salesUser)
            ->getJson("/api/v1/chapters/{$this->chapterId}/allocation-queue")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'duty_denied');
    }

    /** @return array{0: string, 1: string} */
    private function seedItemAndVariant(string $itemCode, string $variantCode, string $itemName, string $variantLabel): array
    {
        $itemId = (string) Str::uuid();
        $variantId = (string) Str::uuid();

        CatalogueItem::create([
            'id' => $itemId,
            'chapter_id' => $this->chapterId,
            'code' => $itemCode,
            'name' => $itemName,
            'unit_id' => $this->unitEachId,
            'material_version' => 1,
            'is_active' => true,
            'state' => 'active',
        ]);

        CatalogueVariant::create([
            'id' => $variantId,
            'chapter_id' => $this->chapterId,
            'item_id' => $itemId,
            'code' => $variantCode,
            'sku' => $variantCode,
            'name' => "{$itemName} / {$variantLabel}",
            'label' => "{$itemName} / {$variantLabel}",
            'unit_id' => $this->unitEachId,
            'quantity_scale' => 0,
            'quantity_identity_locked' => true,
            'material_version' => 1,
            'is_active' => true,
            'state' => 'active',
        ]);

        return [$itemId, $variantId];
    }

    private function seedPolicy(string $key, ?string $subjectId, string $schemaName, array $rulesJson): string
    {
        $policyId = (string) Str::uuid();
        PolicyRecord::create([
            'id' => $policyId,
            'aggregate_id' => $policyId,
            'chapter_id' => $this->chapterId,
            'policy_code' => $key,
            'policy_version' => 1,
            'rules_json' => $rulesJson,
            'effective_from' => now()->subDay(),
            'effective_until' => null,
        ]);

        AuditLog::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $this->chapterHeadId,
            'action' => 'controlled:recordPolicy',
            'entity_type' => 'policy_record',
            'entity_id' => $policyId,
            'details' => [
                'version' => 1,
                'value_sha256' => CanonicalJson::sha256($rulesJson),
                'subject_id' => $subjectId,
                'value_schema_reference' => '#/components/schemas/'.$schemaName,
                'approvals' => [['authority' => 'CHAPTER_HEAD', 'user_id' => $this->chapterHeadId]],
            ],
        ]);

        return $policyId;
    }

    private function createLot(
        string $variantId,
        string $qty,
        string $restrictionState,
        array $boundedOverrides,
        string $sourceType,
        string $sourceReference
    ): string {
        $lotId = (string) Str::uuid();
        $restrictions = match ($restrictionState) {
            'uninterpreted' => [
                'state' => 'uninterpreted',
                'allowed_uses' => [],
                'event_ids' => [],
                'requesting_unit_ids' => [],
                'effective_from' => null,
                'effective_until' => null,
                'interpretation_id' => null,
                'source_condition_reference' => 'UNINTERPRETED-DONATION',
            ],
            'bounded' => array_merge([
                'state' => 'bounded',
                'allowed_uses' => ['internal_use'],
                'event_ids' => [],
                'requesting_unit_ids' => [],
                'effective_from' => null,
                'effective_until' => null,
                'interpretation_id' => (string) Str::uuid(),
                'source_condition_reference' => 'BOUNDED-DONATION',
            ], $boundedOverrides),
            default => null,
        };

        InventoryLot::create([
            'id' => $lotId,
            'chapter_id' => $this->chapterId,
            'variant_id' => $variantId,
            'unit_id' => $this->unitEachId,
            'location_id' => $this->locationId,
            'lot_code' => 'LOT-'.substr($lotId, 0, 8),
            'basis_segment_id' => $lotId,
            'condition' => 'USABLE',
            'custody' => 'STOCKROOM',
            'quantity_on_hand' => $qty,
            'original_quantity' => $qty,
            'quantity_scale' => 0,
            'segments' => [[
                'id' => $lotId,
                'basis_segment_id' => $lotId,
                'offset_quantity' => '0',
                'quantity' => $qty,
                'restrictions' => $restrictions,
            ]],
            'stock_version' => 1,
            'material_version' => 1,
            'source_type' => $sourceType,
            'source_id' => (string) Str::uuid(),
            'source_reference' => $sourceReference,
        ]);

        return $lotId;
    }

    /** @return array{0: string, 1: string} */
    private function createApprovedRf(
        string $requestingUnitId,
        string $variantId,
        string $approvedQty,
        string $reservedQty = '0',
        string $neededAt = '2026-12-01T08:00:00Z',
        string $approvedAt = '2026-11-25T10:00:00Z'
    ): array {
        $rfId = (string) Str::uuid();
        $rfLineId = (string) Str::uuid();
        $seq = substr(str_replace('-', '', $rfId), 0, 6);

        InternalRf::create([
            'id' => $rfId,
            'chapter_id' => $this->chapterId,
            'rf_number' => "RF-2026-{$seq}",
            'requester_user_id' => $this->chapterHeadId,
            'requesting_unit_id' => $requestingUnitId,
            'purpose' => 'internal_use',
            'justification' => 'Chapter activity support',
            'needed_at' => $neededAt,
            'status' => 'approved',
            'fulfillment_status' => 'open',
            'version' => 1,
            'material_version' => 1,
            'progress_version' => 1,
            'submitted_at' => $approvedAt,
            'approved_at' => $approvedAt,
            'approved_by_user_id' => $this->chapterHeadId,
            'approved_material_version' => 1,
        ]);

        InternalRfLine::create([
            'id' => $rfLineId,
            'rf_id' => $rfId,
            'line_order' => 1,
            'variant_id' => $variantId,
            'unit_id' => $this->unitEachId,
            'requested_quantity' => $approvedQty,
            'approved_quantity' => $approvedQty,
            'reserved_quantity' => $reservedQty,
            'blocked_reserved_quantity' => '0',
            'issued_quantity' => '0',
            'canceled_quantity' => '0',
        ]);

        return [$rfId, $rfLineId];
    }

    private function asOfficer(string $id): self
    {
        $origin = 'https://inventory.example.invalid';
        config(['app.url' => $origin]);
        app('url')->useOrigin($origin);
        app('url')->forceScheme('https');

        $session = new BrowserSession([
            'user_id' => $id,
            'user_version' => User::findOrFail($id)->version,
            'authentication_method' => 'password',
            'authenticated_at' => now(),
            'expires_at' => now()->addHour(),
        ]);
        $token = $session->rotateToken();
        $session->save();

        return $this->withCredentials()
            ->withUnencryptedCookie('ysp_session', $token)
            ->withHeaders(['Origin' => $origin, 'X-XSRF-TOKEN' => $session->csrf_token]);
    }
}

final class FakeProcurementSupplyProvider implements OpenProcurementSupplyProvider
{
    /** @var array<int, array<string, mixed>> */
    public array $sources = [];

    public function getInboundSourcesForVariants(
        string $chapterId,
        array $variantIds,
        ?string $excludeRepfId = null,
        ?string $observedAt = null
    ): array {
        return array_values(array_filter(
            $this->sources,
            fn (array $src) => in_array($src['variant_id'], $variantIds, true)
                && ($excludeRepfId === null || ! ($src['source_kind'] === 'repf' && $src['source_id'] === $excludeRepfId))
        ));
    }
}
