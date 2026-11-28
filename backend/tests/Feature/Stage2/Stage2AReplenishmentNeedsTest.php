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
use App\Services\Inventory\RfStockMatcher;
use App\Services\Shared\CanonicalJson;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class Stage2AReplenishmentNeedsTest extends TestCase
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
        $this->travelTo(CarbonImmutable::parse('2026-11-26T12:00:00Z'));

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

    #[DataProvider('rfCoverageCases')]
    public function test_replenishment_matches_each_free_range_to_eligible_rf_demand(
        array $lots, string $aDemand, string $bDemand, string $available, string $shortage, bool $aboveRop = false
    ): void {
        [$itemId, $variantId] = $this->seedItemAndVariant('KIT', 'KIT-M', 'Kit', 'Medium');
        $this->seedPolicy('quantity_scale', $variantId, 'CatalogueQuantityPolicyValue', [
            'unit_id' => $this->unitEachId,
            'quantity_kind' => 'measured',
            'quantity_scale' => 2,
        ]);
        $this->seedPolicy('allocation_priority', null, 'AllocationPriorityPolicyValue', [
            'priorities' => [
                ['requesting_unit_id' => $this->unitAId, 'rank' => 1],
                ['requesting_unit_id' => $this->unitBId, 'rank' => 2],
            ],
            'overrides' => [],
        ]);
        if ($aboveRop) {
            foreach (['rop' => '1.00', 'target_level' => '12.00'] as $policy => $quantity) {
                $this->seedPolicy($policy, $itemId, 'CatalogueThresholdPolicyValue', [
                    'unit_id' => $this->unitEachId, 'quantity' => $quantity,
                ]);
            }
        }
        [, $lineA] = $this->createApprovedRf($this->unitAId, $variantId, $aDemand);
        [, $lineB] = $this->createApprovedRf($this->unitBId, $variantId, $bDemand);

        foreach ($lots as $index => [$quantity, $units, $terms]) {
            $lotId = $this->createLot($variantId, $quantity, 'bounded', $terms + [
                'requesting_unit_ids' => array_map(fn (string $unit) => $unit === 'A' ? $this->unitAId : $this->unitBId, $units),
            ], 'DA_RM', "DA-{$index}", scale: 2);
            InventoryLot::whereKey($lotId)->update(['created_at' => now()->subHours(count($lots) - $index)]);
        }

        $response = $this->asOfficer($this->userId)->get($this->needsUrl());
        $response->assertOk()->assertHeader('Cache-Control', 'no-store')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.quantity_scale', 2)
            ->assertJsonPath('data.0.eligible_available_to_allocate', $available)
            ->assertJsonPath('data.0.low_stock_breach', false)
            ->assertJsonPath('data.0.unreserved_approved_rf_shortage', $shortage)
            ->assertJsonPath('data.0.uncovered_rf_shortage_quantity', $shortage)
            ->assertJsonPath('data.0.proposed_uncovered_quantity', $shortage)
            ->assertJsonPath('data.0.contributing_rf_lines.0.rf_line_id', $lineA)
            ->assertJsonPath('data.0.contributing_rf_lines.1.rf_line_id', $lineB)
            ->assertJsonCount($aboveRop ? 0 : 2, 'data.0.setup_blockers');

        $snapshot = $this->snapshot($variantId);
        $this->assertSame('ready', $snapshot['outcome']);
        $this->assertSame($response->json('data'), $snapshot['items']);
    }

    public static function rfCoverageCases(): array
    {
        $flexible = ['5.00', ['A', 'B'], []];
        $onlyA = ['5.00', ['A'], []];

        return [
            'shared range first' => [[$flexible, $onlyA], '5.00', '5.00', '10.00', '0.00'],
            'shared range last' => [[$onlyA, $flexible], '5.00', '5.00', '10.00', '0.00'],
            'excess constrained stock cannot cover another unit' => [
                [['10.00', ['A'], []]], '2.00', '8.00', '10.00', '8.00', true,
            ],
            'fractional reassignment' => [
                [['5.70', ['A', 'B'], []], ['4.50', ['A'], []]], '5.10', '5.10', '10.20', '0.00',
            ],
            'wrong purpose and event, future and expired terms' => [
                [
                    ['3.00', ['A', 'B'], ['allowed_uses' => ['sale']]],
                    ['4.00', ['A', 'B'], ['event_ids' => ['00000000-0000-4000-8000-000000000001']]],
                    ['4.00', ['A', 'B'], ['effective_from' => '2026-12-01T00:00:00.000000Z']],
                    ['4.00', ['A', 'B'], ['effective_until' => '2026-11-15T00:00:00.000000Z']],
                    ['4.00', ['A', 'B'], ['effective_until' => '2026-11-29T00:00:00.000000Z']],
                    $onlyA,
                ], '2.00', '8.00', '13.00', '8.00',
            ],
        ];
    }

    public function test_holds_and_reservations_overlap_and_inbound_covers_rf_before_rop(): void
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

        // Usable stockroom lot: 25 units (holds=3, reservation=4 with one unit overlapping)
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
            'offset_quantity' => 2,
            'quantity' => 4,
            'consumed_quantity' => 0,
            'released_quantity' => 0,
            'status' => 'active',
        ]);

        // Inbound: Open PO 4 and RepF 5 count; disputed PO 12 stays separate.
        $repfExcludedId = (string) Str::uuid();
        $this->fakeSupply->sources = [
            [
                'variant_id' => $variantId,
                'unit_id' => $this->unitEachId,
                'source_kind' => 'po',
                'source_id' => (string) Str::uuid(),
                'source_reference' => 'CEB-PO-2026-0001',
                'status' => 'partially_received',
                'open_quantity' => '4.000000',
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
            ->get("/api/v1/chapters/{$this->chapterId}/replenishment/needs?trigger_filter=all");

        $response->assertStatus(200)
            ->assertHeader('Cache-Control', 'no-store')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.rop_policy.policy_id', $ropPolicyId)
            ->assertJsonPath('data.0.target_level_policy.policy_id', $targetPolicyId)
            ->assertJsonPath('data.0.usable_stockroom_on_hand', '25')
            ->assertJsonPath('data.0.eligible_usable_stockroom_on_hand', '22')
            ->assertJsonPath('data.0.active_rf_reservations', '4')
            ->assertJsonPath('data.0.eligible_available_to_allocate', '19')
            ->assertJsonPath('data.0.total_unreserved_approved_rf_demand', '26')
            ->assertJsonPath('data.0.unreserved_approved_rf_shortage', '7')
            ->assertJsonPath('data.0.open_repf_quantity', '5')
            ->assertJsonPath('data.0.open_po_inbound_quantity', '4')
            ->assertJsonPath('data.0.total_open_inbound_coverage', '9')
            ->assertJsonPath('data.0.excluded_inbound_quantity', '12')
            ->assertJsonPath('data.0.low_stock_breach', true)
            ->assertJsonPath('data.0.gross_rf_shortage_need', '7')
            ->assertJsonPath('data.0.gross_rop_replenishment_need', '50')
            ->assertJsonPath('data.0.gross_combined_need', '57')
            ->assertJsonPath('data.0.uncovered_rf_shortage_quantity', '0')
            ->assertJsonPath('data.0.uncovered_rop_replenishment_quantity', '48')
            ->assertJsonPath('data.0.proposed_uncovered_quantity', '48')
            ->assertJsonCount(1, 'data.0.contributing_rf_lines')
            ->assertJsonCount(3, 'data.0.inbound_sources');

        $snapshot = $this->snapshot($variantId, $repfExcludedId, detail: false);
        $this->assertSame('ready', $snapshot['outcome']);
        $item = $snapshot['items'][0];
        $this->assertSame('0', $item['open_repf_quantity']);
        $this->assertSame('4', $item['total_open_inbound_coverage']);
        $this->assertSame('3', $item['uncovered_rf_shortage_quantity']);
        $this->assertSame('50', $item['uncovered_rop_replenishment_quantity']);
        $this->assertSame('53', $item['proposed_uncovered_quantity']);
        $this->assertSame([], $item['contributing_rf_lines']);
    }

    public function test_replenishment_query_errors_and_snapshot_pagination(): void
    {
        $url = $this->needsUrl();
        $this->get($url)->assertUnauthorized()->assertHeader('Cache-Control', 'no-store');
        [$firstItem, $first] = $this->seedItemAndVariant('KIT', 'KIT-A', 'Kit', 'A');
        [, $second] = $this->seedItemAndVariant('POSTER', 'POSTER-B', 'Poster', 'B');
        $this->asOfficer($this->userId);
        $this->get($url)->assertConflict()->assertJsonPath('error.code', 'setup_blocked')->assertJsonStructure(['request_id', 'error' => ['blockers']]);
        foreach ([$first, $second] as $variantId) {
            $this->seedPolicy('quantity_scale', $variantId, 'CatalogueQuantityPolicyValue', [
                'unit_id' => $this->unitEachId, 'quantity_kind' => 'piece', 'quantity_scale' => 0,
            ]);
        }

        $this->get($url.'?trigger_filter=rop_breach')->assertConflict()->assertJsonPath('error.code', 'setup_blocked')->assertJsonStructure(['request_id', 'error' => ['blockers']]);
        $this->get($url.'?variant_id='.Str::uuid())->assertNotFound()->assertJsonPath('error.code', 'resource_not_found');
        foreach (['limit=1&limit=2', 'trigger_filter=so_shortage', 'cursor=invalid', 'q=%C2%A0'] as $query) {
            $this->get($url.'?'.$query)->assertBadRequest()->assertJsonPath('error.code', 'invalid_selector');
        }
        $this->get($url, ['X-Action-Key' => (string) Str::uuid()])->assertBadRequest()->assertJsonPath('error.code', 'invalid_selector');
        $this->get($url.'?item_id='.$firstItem.'&q=kIt')->assertOk()->assertJsonPath('data.0.variant_id', $first);

        $page = $this->get($url.'?limit=1')->assertOk()->assertJsonPath('data.0.variant_id', $first);
        $nextUrl = $url.'?limit=1&cursor='.rawurlencode($page->json('page.next_cursor'));
        $this->travel(1)->seconds();
        $this->get($nextUrl)->assertOk()->assertJsonPath('data.0.variant_id', $second)->assertJsonPath('page.next_cursor', null);
        $this->createApprovedRf($this->unitAId, $second, '2');
        $this->get($nextUrl)->assertConflict()->assertJsonPath('error.code', 'snapshot_stale');
    }

    public function test_reassignments_keep_earlier_rf_coverage_even_with_multiple_substitutes(): void
    {
        $uncovered = app(RfStockMatcher::class)->uncovered(['2.50', '2.50', '2.50'], [
            ['quantity' => '2.50', 'ranges' => [0, 1]],
            ['quantity' => '2.50', 'ranges' => [1, 2]],
            ['quantity' => '2.50', 'ranges' => [0]],
            ['quantity' => '2.50', 'ranges' => [2]],
        ]);

        $this->assertSame(['0.000000', '0.000000', '0.000000', '2.50'], $uncovered);
    }

    private function needsUrl(): string
    {
        return "/api/v1/chapters/{$this->chapterId}/replenishment/needs";
    }

    private function snapshot(string $variantId, ?string $excludeRepfId = null, bool $detail = true): array
    {
        return DB::transaction(fn () => app(NetShortageSnapshotParticipant::class)->computeNetShortageSnapshot([
            'chapter_id' => $this->chapterId,
            'actor_id' => $this->userId,
            'observed_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
            'variant_ids' => [$variantId],
            'include_rf_line_breakdown' => $detail,
            'require_rop_and_target_policies' => false,
            'exclude_repf_id' => $excludeRepfId,
        ]));
    }

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
        string $sourceReference,
        int $scale = 0,
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
            'quantity_scale' => $scale,
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
