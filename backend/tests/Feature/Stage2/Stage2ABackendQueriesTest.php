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

    public function test_allocation_queue_enforces_rf_visibility_and_unit_scope_with_uniform_404(): void
    {
        [, $variantId] = $this->seedItemAndVariant('SOAP', 'SOAP-1', 'Bath Soap', 'Bar');
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

        $this->createLot($variantId, '20', 'unrestricted', [], 'IPC', 'RM-IPC-SOAP');
        [$rfAId, $rfALineId] = $this->createApprovedRf($this->unitAId, $variantId, '5');
        [$rfBId] = $this->createApprovedRf($this->unitBId, $variantId, '7');

        // Unit-A-scoped INVENTORY officer
        $unitAOfficer = (string) Str::uuid();
        User::create([
            'id' => $unitAOfficer,
            'public_id' => 'unita-inv@example.invalid',
            'name' => 'Unit A Inventory',
            'email' => 'unita-inv@example.invalid',
            'password_hash' => hash('sha256', 'Password123!'),
            'status' => 'active',
            'version' => 1,
        ]);
        ChapterMembership::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $unitAOfficer,
            'membership_status' => 'active',
            'version' => 1,
        ]);
        DutyGrant::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $unitAOfficer,
            'duty_code' => 'INVENTORY',
            'scope' => ['unit_id' => $this->unitAId],
            'status' => 'active',
            'is_alternate' => false,
            'valid_from' => now()->subDay(),
            'version' => 1,
        ]);

        // Unfiltered queue must only include Unit A RF, never Unit B
        $this->asOfficer($unitAOfficer)
            ->getJson("/api/v1/chapters/{$this->chapterId}/allocation-queue")
            ->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.rf_id', $rfAId)
            ->assertJsonPath('data.0.rf_line_id', $rfALineId);

        // Explicit rf_id for another unit yields uniform 404 resource_not_found
        $this->asOfficer($unitAOfficer)
            ->getJson("/api/v1/chapters/{$this->chapterId}/allocation-queue?rf_id={$rfBId}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'resource_not_found');

        // Routed RF_APPROVER for Unit A only must also see Unit A and get 404 for unrouted Unit B
        $approverId = (string) Str::uuid();
        User::create([
            'id' => $approverId,
            'public_id' => 'approver-a@example.invalid',
            'name' => 'Approver A',
            'email' => 'approver-a@example.invalid',
            'password_hash' => hash('sha256', 'Password123!'),
            'status' => 'active',
            'version' => 1,
        ]);
        ChapterMembership::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $approverId,
            'membership_status' => 'active',
            'version' => 1,
        ]);
        $approverGrantId = (string) Str::uuid();
        DutyGrant::create([
            'id' => $approverGrantId,
            'chapter_id' => $this->chapterId,
            'user_id' => $approverId,
            'duty_code' => 'RF_APPROVER',
            'scope' => ['unit_id' => $this->unitAId],
            'status' => 'active',
            'is_alternate' => false,
            'valid_from' => now()->subDay(),
            'version' => 1,
        ]);
        $this->seedPolicy('rf_approval_route', null, 'RfApprovalRoutePolicyValue', [
            'routes' => [[
                'requesting_unit_id' => $this->unitAId,
                'primary_approver_grant_id' => $approverGrantId,
                'alternate_authorization_ids' => [],
            ]],
        ]);

        $this->asOfficer($approverId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/allocation-queue")
            ->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.rf_id', $rfAId);

        $this->asOfficer($approverId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/allocation-queue?rf_id={$rfBId}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'resource_not_found');
    }

    public function test_multi_range_bounded_shortage_matching_and_overlapping_hold_reservation(): void
    {
        [, $variantSplitId] = $this->seedItemAndVariant('CAN', 'CAN-S', 'Canned Goods', 'Single');
        [, $variantOverlapId] = $this->seedItemAndVariant('NOODLE', 'NOODLE-S', 'Noodles', 'Pack');
        foreach ([$variantSplitId, $variantOverlapId] as $vId) {
            $this->seedPolicy('quantity_scale', $vId, 'CatalogueQuantityPolicyValue', [
                'unit_id' => $this->unitEachId,
                'quantity_kind' => 'piece',
                'quantity_scale' => 0,
            ]);
        }
        $this->seedPolicy('allocation_priority', null, 'AllocationPriorityPolicyValue', [
            'priorities' => [
                ['requesting_unit_id' => $this->unitAId, 'rank' => 1],
                ['requesting_unit_id' => $this->unitBId, 'rank' => 2],
            ],
            'overrides' => [],
        ]);

        // Lot with 5 restricted to Unit A [0, 5) + 5 restricted to Unit B [5, 10)
        $splitLotId = (string) Str::uuid();
        InventoryLot::create([
            'id' => $splitLotId,
            'chapter_id' => $this->chapterId,
            'variant_id' => $variantSplitId,
            'unit_id' => $this->unitEachId,
            'location_id' => $this->locationId,
            'lot_code' => 'LOT-SPLIT',
            'basis_segment_id' => $splitLotId,
            'condition' => 'USABLE',
            'custody' => 'STOCKROOM',
            'quantity_on_hand' => '10',
            'original_quantity' => '10',
            'quantity_scale' => 0,
            'segments' => [
                [
                    'id' => (string) Str::uuid(),
                    'basis_segment_id' => $splitLotId,
                    'offset_quantity' => '0',
                    'quantity' => '5',
                    'restrictions' => [
                        'state' => 'bounded',
                        'allowed_uses' => ['internal_use'],
                        'event_ids' => [],
                        'requesting_unit_ids' => [$this->unitAId],
                        'effective_from' => null,
                        'effective_until' => null,
                        'interpretation_id' => (string) Str::uuid(),
                        'source_condition_reference' => 'SEG-A-ONLY',
                    ],
                ],
                [
                    'id' => (string) Str::uuid(),
                    'basis_segment_id' => $splitLotId,
                    'offset_quantity' => '5',
                    'quantity' => '5',
                    'restrictions' => [
                        'state' => 'bounded',
                        'allowed_uses' => ['internal_use'],
                        'event_ids' => [],
                        'requesting_unit_ids' => [$this->unitBId],
                        'effective_from' => null,
                        'effective_until' => null,
                        'interpretation_id' => (string) Str::uuid(),
                        'source_condition_reference' => 'SEG-B-ONLY',
                    ],
                ],
            ],
            'stock_version' => 1,
            'material_version' => 1,
            'source_type' => 'DA',
            'source_id' => (string) Str::uuid(),
            'source_reference' => 'RM-DA-SPLIT',
        ]);

        // Two Unit A RFs needing 4 each (total A demand 8 against only 5 A units => shortage 3!)
        // Plus one Unit B RF needing 5 (covered cleanly by the 5 B units => 0 added shortage)
        $this->createApprovedRf($this->unitAId, $variantSplitId, '4');
        $this->createApprovedRf($this->unitAId, $variantSplitId, '4');
        $this->createApprovedRf($this->unitBId, $variantSplitId, '5');

        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/replenishment/needs?variant_id={$variantSplitId}")
            ->assertStatus(200)
            ->assertJsonPath('data.0.total_unreserved_approved_rf_demand', '13')
            ->assertJsonPath('data.0.eligible_available_to_allocate', '10')
            ->assertJsonPath('data.0.unreserved_approved_rf_shortage', '3');

        // Lot with overlapping Hold [0, 4) AND Active RF Reservation [0, 4): union removed is 4 (not 8!), leaving 6 free
        $overlapLotId = $this->createLot($variantOverlapId, '10', 'unrestricted', [], 'IPC', 'RM-IPC-OVERLAP');
        $hold = StockHold::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'version' => 1,
            'reason_code' => 'inspection_hold',
            'reason' => 'Overlapping hold check',
            'status' => 'active',
            'placed_by_user_id' => $this->userId,
        ]);
        StockHoldRange::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'hold_id' => $hold->id,
            'lot_id' => $overlapLotId,
            'basis_segment_id' => $overlapLotId,
            'offset_quantity' => 0,
            'quantity' => 4,
        ]);
        [$rfOvId, $rfOvLineId] = $this->createApprovedRf($this->unitAId, $variantOverlapId, '10', '4');
        $resv = StockReservation::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'source_type' => 'RF',
            'source_id' => $rfOvId,
            'source_line_id' => $rfOvLineId,
            'rf_line_id' => $rfOvLineId,
            'lot_id' => $overlapLotId,
            'version' => 1,
            'material_version' => 1,
            'quantity' => 4,
            'committed_quantity' => 4,
            'active_quantity' => 4,
            'fulfilled_quantity' => 0,
            'released_quantity' => 0,
            'blocked_quantity' => 4,
            'status' => 'ACTIVE',
            'state' => 'ACTIVE',
            'created_by_user_id' => $this->userId,
        ]);
        RfReservationAllocation::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'reservation_id' => $resv->id,
            'lot_id' => $overlapLotId,
            'basis_segment_id' => $overlapLotId,
            'offset_quantity' => 0,
            'quantity' => 4,
            'consumed_quantity' => 0,
            'released_quantity' => 0,
            'status' => 'active',
        ]);

        // Unreserved demand = 6; free intervals [4, 10) = 6 => eligible_available=6 and shortage MUST BE 0 (never manufactured!)
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/replenishment/needs?variant_id={$variantOverlapId}")
            ->assertStatus(200)
            ->assertJsonPath('data.0.usable_stockroom_on_hand', '10')
            ->assertJsonPath('data.0.eligible_usable_stockroom_on_hand', '6')
            ->assertJsonPath('data.0.active_rf_reservations', '4')
            ->assertJsonPath('data.0.eligible_available_to_allocate', '6')
            ->assertJsonPath('data.0.total_unreserved_approved_rf_demand', '6')
            ->assertJsonPath('data.0.unreserved_approved_rf_shortage', '0');
    }

    public function test_sibling_variants_apply_rop_top_up_and_open_supply_once_with_row_consistency(): void
    {
        [$itemId, $variant1Id] = $this->seedItemAndVariant('GLOVE', 'GLOVE-M', 'Safety Gloves', 'Medium');
        $variant2Id = (string) Str::uuid();
        CatalogueVariant::create([
            'id' => $variant2Id,
            'chapter_id' => $this->chapterId,
            'item_id' => $itemId,
            'code' => 'GLOVE-L',
            'sku' => 'GLOVE-L',
            'name' => 'Safety Gloves / Large',
            'label' => 'Safety Gloves / Large',
            'unit_id' => $this->unitEachId,
            'quantity_scale' => 0,
            'quantity_identity_locked' => true,
            'material_version' => 1,
            'is_active' => true,
            'state' => 'active',
        ]);
        foreach ([$variant1Id, $variant2Id] as $vId) {
            $this->seedPolicy('quantity_scale', $vId, 'CatalogueQuantityPolicyValue', [
                'unit_id' => $this->unitEachId,
                'quantity_kind' => 'piece',
                'quantity_scale' => 0,
            ]);
        }
        $this->seedPolicy('rop', $itemId, 'CatalogueThresholdPolicyValue', [
            'unit_id' => $this->unitEachId,
            'quantity' => '50',
        ]);
        $this->seedPolicy('target_level', $itemId, 'CatalogueThresholdPolicyValue', [
            'unit_id' => $this->unitEachId,
            'quantity' => '30',
        ]);

        // Zero stock, both siblings short 5; single PO of 5 strictly on variant2 (plus a mismatched-unit source that must be ignored)
        $this->createApprovedRf($this->unitAId, $variant1Id, '5');
        $this->createApprovedRf($this->unitBId, $variant2Id, '5');
        $this->fakeSupply->sources = [
            [
                'variant_id' => $variant2Id,
                'unit_id' => $this->unitEachId,
                'source_kind' => 'po',
                'source_id' => (string) Str::uuid(),
                'source_reference' => 'CEB-PO-GLOVE-L',
                'status' => 'issued',
                'open_quantity' => '5.000000',
                'coverage_state' => 'counted',
                'exclusion_reason' => null,
            ],
            [
                'variant_id' => $variant1Id,
                'unit_id' => (string) Str::uuid(),
                'source_kind' => 'po',
                'source_id' => (string) Str::uuid(),
                'source_reference' => 'CEB-PO-WRONG-UNIT',
                'status' => 'issued',
                'open_quantity' => '50.000000',
                'coverage_state' => 'counted',
                'exclusion_reason' => null,
            ],
        ];

        $resp = $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/replenishment/needs?item_id={$itemId}")
            ->assertStatus(200)
            ->assertJsonCount(2, 'data');

        $rows = collect($resp->json('data'))->keyBy('variant_id');
        $r1 = $rows[$variant1Id];
        $r2 = $rows[$variant2Id];

        // Open supply attributed strictly to matching variant & unit, applied to RF shortage first
        $this->assertSame('0', $r1['total_open_inbound_coverage']);
        $this->assertSame('5', $r1['gross_rf_shortage_need']);
        $this->assertSame('5', $r1['uncovered_rf_shortage_quantity']);

        $this->assertSame('5', $r2['total_open_inbound_coverage']);
        $this->assertSame('5', $r2['gross_rf_shortage_need']);
        $this->assertSame('0', $r2['uncovered_rf_shortage_quantity']);

        // Shared item ROP top-up of 30 assigned ONCE across siblings (never 60!), and row math strictly consistent
        $this->assertSame(30, (int) $r1['gross_rop_replenishment_need'] + (int) $r2['gross_rop_replenishment_need']);
        foreach ([$r1, $r2] as $row) {
            $this->assertSame(
                (int) $row['gross_rf_shortage_need'] + (int) $row['gross_rop_replenishment_need'],
                (int) $row['gross_combined_need']
            );
            $this->assertSame(
                (int) $row['uncovered_rf_shortage_quantity'] + (int) $row['uncovered_rop_replenishment_quantity'],
                (int) $row['proposed_uncovered_quantity']
            );
        }
    }

    public function test_lot_eligibility_honors_explicit_intended_use_and_rejects_incompatible_rf_context(): void
    {
        [, $variantId] = $this->seedItemAndVariant('BLANKET', 'BLK-1', 'Wool Blanket', 'Single');
        $this->seedPolicy('quantity_scale', $variantId, 'CatalogueQuantityPolicyValue', [
            'unit_id' => $this->unitEachId,
            'quantity_kind' => 'piece',
            'quantity_scale' => 0,
        ]);

        $internalOnlyLotId = $this->createLot($variantId, '8', 'bounded', [
            'allowed_uses' => ['internal_use'],
            'requesting_unit_ids' => [$this->unitAId],
        ], 'DA', 'RM-DA-INT');
        $unrestrictedLotId = $this->createLot($variantId, '6', 'unrestricted', [], 'IPC', 'RM-IPC-GEN');
        [$rfAId] = $this->createApprovedRf($this->unitAId, $variantId, '4');

        // Permitted RF internal use => eligible true, internal_use_eligible true, sale_eligible false
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/lots/{$internalOnlyLotId}/eligibility?intended_use=internal_use&rf_id={$rfAId}")
            ->assertStatus(200)
            ->assertJsonPath('data.eligible', true)
            ->assertJsonPath('data.internal_use_eligible', true)
            ->assertJsonPath('data.sale_eligible', false);

        // Sale query + internal_use RF context => primary eligible MUST BE false (no RF purpose substitution!)
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/lots/{$internalOnlyLotId}/eligibility?intended_use=sale&rf_id={$rfAId}")
            ->assertStatus(200)
            ->assertJsonPath('data.eligible', false)
            ->assertJsonPath('data.internal_use_eligible', true)
            ->assertJsonPath('data.sale_eligible', false);

        // Unrestricted same-SKU lot: sale without RF is eligible, sale with internal-use RF is incompatible
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/lots/{$unrestrictedLotId}/eligibility?intended_use=sale")
            ->assertStatus(200)
            ->assertJsonPath('data.eligible', true)
            ->assertJsonPath('data.sale_eligible', true);
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/lots/{$unrestrictedLotId}/eligibility?intended_use=sale&rf_id={$rfAId}")
            ->assertStatus(200)
            ->assertJsonPath('data.eligible', false)
            ->assertJsonPath('data.sale_eligible', true);
    }

    public function test_compact_cursors_max_length_search_authority_version_and_full_snapshot_staleness(): void
    {
        $maxLabel = str_repeat('Á', 80);
        [$itemId, $v1Id] = $this->seedItemAndVariant('MAXLEN', 'MAX-1', $maxLabel, 'One');
        $v2Id = (string) Str::uuid();
        CatalogueVariant::create([
            'id' => $v2Id,
            'chapter_id' => $this->chapterId,
            'item_id' => $itemId,
            'code' => 'MAX-2',
            'sku' => 'MAX-2',
            'name' => $maxLabel,
            'label' => $maxLabel,
            'unit_id' => $this->unitEachId,
            'quantity_scale' => 0,
            'quantity_identity_locked' => true,
            'material_version' => 1,
            'is_active' => true,
            'state' => 'active',
        ]);
        foreach ([$v1Id, $v2Id] as $vId) {
            $this->seedPolicy('quantity_scale', $vId, 'CatalogueQuantityPolicyValue', [
                'unit_id' => $this->unitEachId,
                'quantity_kind' => 'piece',
                'quantity_scale' => 0,
            ]);
        }
        $this->seedPolicy('allocation_priority', null, 'AllocationPriorityPolicyValue', [
            'priorities' => [['requesting_unit_id' => $this->unitAId, 'rank' => 1]],
            'overrides' => [],
        ]);

        $lot1Id = $this->createLot($v1Id, '10', 'unrestricted', [], 'IPC', 'RM-MAX-1');
        $this->createApprovedRf($this->unitAId, $v1Id, '4');
        $this->createApprovedRf($this->unitAId, $v2Id, '3');

        // 1. Maximum-length 80-char UTF-8 search + UUID filters produces usable cursor <= 1024 chars
        $qParam = rawurlencode($maxLabel);
        $repPage1 = $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/replenishment/needs?q={$qParam}&item_id={$itemId}&trigger_filter=all&limit=1")
            ->assertStatus(200);
        $repCursor = (string) $repPage1->json('page.next_cursor');
        $this->assertNotSame('', $repCursor);
        $this->assertLessThanOrEqual(1024, strlen($repCursor));

        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/replenishment/needs?q={$qParam}&item_id={$itemId}&trigger_filter=all&limit=1&cursor=".urlencode($repCursor))
            ->assertStatus(200)
            ->assertJsonCount(1, 'data');

        // 2. Adding excluded inbound leaves headline quantity unchanged but mutates full snapshot => 409 snapshot_stale
        $this->fakeSupply->sources = [[
            'variant_id' => $v1Id,
            'unit_id' => $this->unitEachId,
            'source_kind' => 'po',
            'source_id' => (string) Str::uuid(),
            'source_reference' => 'CEB-PO-EXCL-99',
            'status' => 'partially_received',
            'open_quantity' => '12.000000',
            'coverage_state' => 'disputed',
            'exclusion_reason' => 'Disputed delivery quantity',
        ]];
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/replenishment/needs?q={$qParam}&item_id={$itemId}&trigger_filter=all&limit=1&cursor=".urlencode($repCursor))
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'snapshot_stale');
        $this->fakeSupply->sources = [];

        // Refresh cursor and verify authority version change (while access stays granted) returns 409 snapshot_stale
        $repCursor2 = (string) $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/replenishment/needs?q={$qParam}&item_id={$itemId}&limit=1")
            ->json('page.next_cursor');
        $queueCursor = (string) $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/allocation-queue?item_id={$itemId}&limit=1")
            ->json('page.next_cursor');

        // Eligibility state change on lot leaving headline free quantity ('10') unchanged => allocation-queue 409 snapshot_stale
        InventoryLot::whereKey($lot1Id)->update([
            'segments' => [[
                'id' => $lot1Id,
                'basis_segment_id' => $lot1Id,
                'offset_quantity' => '0',
                'quantity' => '10',
                'restrictions' => [
                    'state' => 'bounded',
                    'allowed_uses' => ['internal_use'],
                    'event_ids' => [],
                    'requesting_unit_ids' => [$this->unitAId],
                    'effective_from' => null,
                    'effective_until' => null,
                    'interpretation_id' => (string) Str::uuid(),
                    'source_condition_reference' => 'NEWLY-BOUNDED',
                ],
            ]],
        ]);
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/allocation-queue?item_id={$itemId}&limit=1&cursor=".urlencode($queueCursor))
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'snapshot_stale');

        // Authority version bump while caller still retains INVENTORY access => 409 snapshot_stale on both endpoints
        DutyGrant::where('chapter_id', $this->chapterId)
            ->where('user_id', $this->userId)
            ->where('duty_code', 'INVENTORY')
            ->increment('version');

        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/replenishment/needs?q={$qParam}&item_id={$itemId}&limit=1&cursor=".urlencode($repCursor2))
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'snapshot_stale');
    }

    public function test_connected_po_before_receipt_partial_rm_repf_to_po_bounded_reserve_and_rejections(): void
    {
        [$itemId, $variantId] = $this->seedItemAndVariant('HYG', 'HYG-KIT', 'Hygiene Kit', 'Box');
        $this->seedPolicy('quantity_scale', $variantId, 'CatalogueQuantityPolicyValue', [
            'unit_id' => $this->unitEachId,
            'quantity_kind' => 'piece',
            'quantity_scale' => 0,
        ]);
        $this->seedPolicy('rop', $itemId, 'CatalogueThresholdPolicyValue', [
            'unit_id' => $this->unitEachId,
            'quantity' => '50',
        ]);
        $this->seedPolicy('target_level', $itemId, 'CatalogueThresholdPolicyValue', [
            'unit_id' => $this->unitEachId,
            'quantity' => '100',
        ]);
        $this->seedPolicy('allocation_priority', null, 'AllocationPriorityPolicyValue', [
            'priorities' => [
                ['requesting_unit_id' => $this->unitAId, 'rank' => 1],
                ['requesting_unit_id' => $this->unitBId, 'rank' => 2],
            ],
            'overrides' => [],
        ]);

        // 1. Issued PO of 100 BEFORE any physical lot exists
        $poId = (string) Str::uuid();
        $this->fakeSupply->sources = [[
            'variant_id' => $variantId,
            'unit_id' => $this->unitEachId,
            'source_kind' => 'po',
            'source_id' => $poId,
            'source_reference' => 'CEB-PO-2026-0100',
            'status' => 'issued',
            'open_quantity' => '100.000000',
            'coverage_state' => 'counted',
            'exclusion_reason' => null,
        ]];

        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/variants/{$variantId}")
            ->assertStatus(200)
            ->assertJsonPath('data.views.usable_stockroom_on_hand.quantity', '0')
            ->assertJsonPath('data.views.inbound_open_po.quantity', '100');

        // 2. Partial RM accepts 40 usable (bounded to Unit A) + 10 rejected => 60 remains open inbound
        $acceptedLotId = $this->createLot($variantId, '40', 'bounded', [
            'allowed_uses' => ['internal_use'],
            'requesting_unit_ids' => [$this->unitAId],
        ], 'PO_DR', 'RM-PO-40');
        $rejectedLotId = (string) Str::uuid();
        InventoryLot::create([
            'id' => $rejectedLotId,
            'chapter_id' => $this->chapterId,
            'variant_id' => $variantId,
            'unit_id' => $this->unitEachId,
            'location_id' => $this->locationId,
            'lot_code' => 'LOT-REJ-10',
            'basis_segment_id' => $rejectedLotId,
            'condition' => 'REJECTED',
            'custody' => 'STOCKROOM',
            'quantity_on_hand' => '10',
            'original_quantity' => '10',
            'quantity_scale' => 0,
            'segments' => [['id' => $rejectedLotId, 'basis_segment_id' => $rejectedLotId, 'offset_quantity' => '0', 'quantity' => '10', 'restrictions' => null]],
            'stock_version' => 1,
            'material_version' => 1,
            'source_type' => 'PO_DR',
            'source_id' => (string) Str::uuid(),
            'source_reference' => 'RM-PO-REJ-10',
        ]);
        $this->fakeSupply->sources[0]['status'] = 'partially_received';
        $this->fakeSupply->sources[0]['open_quantity'] = '60.000000';

        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/variants/{$variantId}")
            ->assertStatus(200)
            ->assertJsonPath('data.views.usable_stockroom_on_hand.quantity', '40')
            ->assertJsonPath('data.views.quarantined_rejected.quantity', '10')
            ->assertJsonPath('data.views.inbound_open_po.quantity', '60');
        $this->asOfficer($this->userId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/lots/{$rejectedLotId}/eligibility")
            ->assertStatus(200)
            ->assertJsonPath('data.eligible', false);

        // 3. RepF exclusion & RepF->PO transition deduct coverage once (50 total when RepF orders into PO)
        $repfId = (string) Str::uuid();
        $this->fakeSupply->sources = [[
            'variant_id' => $variantId,
            'unit_id' => $this->unitEachId,
            'source_kind' => 'repf',
            'source_id' => $repfId,
            'source_reference' => 'CEB-REPF-0050',
            'status' => 'approved',
            'open_quantity' => '50.000000',
            'coverage_state' => 'counted',
            'exclusion_reason' => null,
        ]];
        /** @var NetShortageSnapshotParticipant $participant */
        $participant = $this->app->make(NetShortageSnapshotParticipant::class);
        $withExclude = $participant->computeNetShortageSnapshot([
            'chapter_id' => $this->chapterId,
            'actor_id' => $this->userId,
            'observed_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
            'variant_ids' => [$variantId],
            'include_rf_line_breakdown' => false,
            'require_rop_and_target_policies' => true,
            'exclude_repf_id' => $repfId,
        ]);
        $this->assertSame('0', $withExclude['items'][0]['total_open_inbound_coverage']);

        // Transition RepF -> PO (RepF open_quantity becomes 0, PO open_quantity is 50)
        $this->fakeSupply->sources = [[
            'variant_id' => $variantId,
            'unit_id' => $this->unitEachId,
            'source_kind' => 'po',
            'source_id' => $poId,
            'source_reference' => 'CEB-PO-FROM-REPF',
            'status' => 'issued',
            'open_quantity' => '50.000000',
            'coverage_state' => 'counted',
            'exclusion_reason' => null,
        ]];
        $afterTransition = $participant->computeNetShortageSnapshot([
            'chapter_id' => $this->chapterId,
            'actor_id' => $this->userId,
            'observed_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
            'variant_ids' => [$variantId],
            'include_rf_line_breakdown' => false,
            'require_rop_and_target_policies' => true,
            'exclude_repf_id' => null,
        ]);
        $this->assertSame('50', $afterTransition['items'][0]['open_po_inbound_quantity']);
        $this->assertSame('50', $afterTransition['items'][0]['total_open_inbound_coverage']);
        $this->assertSame('10', $afterTransition['items'][0]['proposed_uncovered_quantity']);

        // 4. Permitted bounded lot reserve commit + rejected references without committing
        [$rfAId, $rfALineId] = $this->createApprovedRf($this->unitAId, $variantId, '10');
        [$rfBId, $rfBLineId] = $this->createApprovedRf($this->unitBId, $variantId, '5');

        $prepPermitted = $this->asOfficer($this->userId)
            ->withHeader('X-Action-Key', (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfAId}/reservation-preparations", [
                'expected_rf_version' => 1,
                'expected_rf_material_version' => 1,
                'expected_rf_progress_version' => 1,
                'rf_line_id' => $rfALineId,
                'targets' => [[
                    'stock_lot_id' => $acceptedLotId,
                    'basis_segment_id' => $acceptedLotId,
                    'offset_quantity' => '0',
                    'quantity' => '4',
                    'expected_lot_material_version' => 1,
                    'expected_stock_version' => 1,
                ]],
            ])
            ->assertStatus(201);
        $this->asOfficer($this->userId)
            ->withHeader('X-Action-Key', (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfAId}/reservation-preparations/{$prepPermitted->json('data.resource_id')}/commit", [
                'expected_rf_version' => 1,
                'expected_rf_material_version' => 1,
                'expected_rf_progress_version' => 1,
                'expected_preparation_version' => 1,
            ])
            ->assertStatus(201);
        $this->assertSame(1, StockReservation::where('chapter_id', $this->chapterId)->where('source_id', $rfAId)->count());

        // Blocked hold range [10, 20) on accepted lot -> prepare/commit must reject without creating reservation
        $hold = StockHold::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'version' => 1,
            'reason_code' => 'damage_inspection',
            'reason' => 'Damaged interval',
            'status' => 'active',
            'placed_by_user_id' => $this->userId,
        ]);
        StockHoldRange::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'hold_id' => $hold->id,
            'lot_id' => $acceptedLotId,
            'basis_segment_id' => $acceptedLotId,
            'offset_quantity' => 10,
            'quantity' => 10,
        ]);
        $freshRfA = InternalRf::findOrFail($rfAId);
        $freshLot = InventoryLot::findOrFail($acceptedLotId);
        $resBeforeFail = StockReservation::where('chapter_id', $this->chapterId)->count();
        $prepHeld = $this->asOfficer($this->userId)
            ->withHeader('X-Action-Key', (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfAId}/reservation-preparations", [
                'expected_rf_version' => (int) $freshRfA->version,
                'expected_rf_material_version' => (int) $freshRfA->material_version,
                'expected_rf_progress_version' => (int) $freshRfA->progress_version,
                'rf_line_id' => $rfALineId,
                'targets' => [[
                    'stock_lot_id' => $acceptedLotId,
                    'basis_segment_id' => $acceptedLotId,
                    'offset_quantity' => '10',
                    'quantity' => '4',
                    'expected_lot_material_version' => (int) $freshLot->material_version,
                    'expected_stock_version' => (int) $freshLot->stock_version,
                ]],
            ])
            ->assertStatus(201);
        $this->asOfficer($this->userId)
            ->withHeader('X-Action-Key', (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfAId}/reservation-preparations/{$prepHeld->json('data.resource_id')}/commit", [
                'expected_rf_version' => (int) $freshRfA->version,
                'expected_rf_material_version' => (int) $freshRfA->material_version,
                'expected_rf_progress_version' => (int) $freshRfA->progress_version,
                'expected_preparation_version' => 1,
            ])
            ->assertStatus(409);

        // Wrong-parent rf_line_id (rfBLineId under rfAId) -> rejected cleanly
        $this->asOfficer($this->userId)
            ->withHeader('X-Action-Key', (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfAId}/reservation-preparations", [
                'expected_rf_version' => (int) $freshRfA->version,
                'expected_rf_material_version' => (int) $freshRfA->material_version,
                'expected_rf_progress_version' => (int) $freshRfA->progress_version,
                'rf_line_id' => $rfBLineId,
                'targets' => [[
                    'stock_lot_id' => $acceptedLotId,
                    'basis_segment_id' => $acceptedLotId,
                    'offset_quantity' => '4',
                    'quantity' => '2',
                    'expected_lot_material_version' => (int) $freshLot->material_version,
                    'expected_stock_version' => (int) $freshLot->stock_version,
                ]],
            ])
            ->assertStatus(404);

        // Unauthorized non-inventory officer -> 403 without committing
        $viewerId = (string) Str::uuid();
        User::create([
            'id' => $viewerId,
            'public_id' => 'viewer2a@example.invalid',
            'name' => 'Viewer',
            'email' => 'viewer2a@example.invalid',
            'password_hash' => hash('sha256', 'Password123!'),
            'status' => 'active',
            'version' => 1,
        ]);
        ChapterMembership::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $viewerId,
            'membership_status' => 'active',
            'version' => 1,
        ]);
        $this->asOfficer($viewerId)
            ->withHeader('X-Action-Key', (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfAId}/reservation-preparations", [
                'expected_rf_version' => (int) $freshRfA->version,
                'expected_rf_material_version' => (int) $freshRfA->material_version,
                'expected_rf_progress_version' => (int) $freshRfA->progress_version,
                'rf_line_id' => $rfALineId,
                'targets' => [[
                    'stock_lot_id' => $acceptedLotId,
                    'basis_segment_id' => $acceptedLotId,
                    'offset_quantity' => '4',
                    'quantity' => '2',
                    'expected_lot_material_version' => (int) $freshLot->material_version,
                    'expected_stock_version' => (int) $freshLot->stock_version,
                ]],
            ])
            ->assertStatus(403);

        $this->assertSame($resBeforeFail, StockReservation::where('chapter_id', $this->chapterId)->count());
        $this->assertNotNull($rfBId);
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
            'authentication_method' => 'totp',
            'next_step' => null,
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
