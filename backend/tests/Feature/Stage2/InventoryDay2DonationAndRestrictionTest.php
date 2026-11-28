<?php

namespace Tests\Feature\Stage2;

use App\Exceptions\ContractException;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\ChapterOpeningGuard;
use App\Models\DomainNotificationOutbox;
use App\Models\DutyGrant;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use App\Models\InternalRf;
use App\Models\InternalRfLine;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\RfReservationAllocation;
use App\Models\StockHold;
use App\Models\StockReservation;
use App\Models\User;
use App\Services\Evidence\PaperEvidenceStore;
use App\Services\Inventory\Participants\ApplyLotRestrictionResolutionParticipant;
use App\Services\Inventory\Participants\PrepareReceivingInventoryParticipant;
use App\Services\Inventory\ReservationService;
use App\Services\Inventory\StockViewQueryService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\TestCase;

class InventoryDay2DonationAndRestrictionTest extends TestCase
{
    use AuthenticatesBrowserOfficer;
    use RefreshDatabase;

    private string $chapterId;

    private string $receivingUserId;

    private string $inventoryUserId;

    private string $headUserId;

    private string $financeUserId;

    private string $requestingUnitId;

    private string $unitPcsId;

    private string $itemId;

    private string $variantPcsId;

    private string $locationId;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('evidence');

        $this->chapterId = (string) Str::uuid();
        $this->receivingUserId = (string) Str::uuid();
        $this->inventoryUserId = (string) Str::uuid();
        $this->headUserId = (string) Str::uuid();
        $this->financeUserId = (string) Str::uuid();
        $this->requestingUnitId = (string) Str::uuid();

        Chapter::create([
            'id' => $this->chapterId,
            'code' => 'SYN-CEBU',
            'name' => 'Cebu Chapter',
            'status' => 'live',
            'version' => 1,
        ]);

        foreach ([
            $this->receivingUserId => ['receiver@example.invalid', 'Receiving Officer', ['RECEIVING', 'INVENTORY']],
            $this->inventoryUserId => ['inventory@example.invalid', 'Inventory Officer', ['INVENTORY']],
            $this->headUserId => ['head@example.invalid', 'Chapter Head', ['CHAPTER_HEAD']],
            $this->financeUserId => ['finance@example.invalid', 'Finance Officer', ['FINANCE']],
        ] as $id => [$email, $name, $duties]) {
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
                    'version' => 1,
                ]);
            }
        }

        $this->seedEffectiveStage1Policies($this->chapterId, $this->headUserId, $this->financeUserId);

        ChapterOpeningGuard::updateOrCreate(
            ['chapter_id' => $this->chapterId],
            [
                'stock_version' => 22,
                'posted_rm_id' => (string) Str::uuid(),
                'posted_ipc_id' => (string) Str::uuid(),
                'outcome_id' => (string) Str::uuid(),
                'outcome_json' => ['stock_version' => 22],
                'posted_at' => now()->subDays(2),
            ]
        );

        $this->unitPcsId = (string) Str::uuid();
        CatalogueUnit::create([
            'id' => $this->unitPcsId,
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
            'code' => 'SHIRT',
            'name' => 'Chapter Shirt',
            'unit_id' => $this->unitPcsId,
            'state' => 'active',
            'material_version' => 1,
        ]);

        $this->variantPcsId = (string) Str::uuid();
        CatalogueVariant::create([
            'id' => $this->variantPcsId,
            'chapter_id' => $this->chapterId,
            'item_id' => $this->itemId,
            'sku' => 'SHIRT-M',
            'name' => 'Chapter Shirt / Medium',
            'label' => 'Chapter Shirt / Medium',
            'unit_id' => $this->unitPcsId,
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

    public function test_da_rm_mixed_restrictions_sharing_sku_enforces_adr0004_blocking_and_emits_stock_lot_outbox(): void
    {
        $daId = (string) Str::uuid();
        $daLineBoundedId = (string) Str::uuid();
        $daLineUninterpretedId = (string) Str::uuid();
        $daLineOpenOtherId = (string) Str::uuid();
        $rmId = (string) Str::uuid();
        $boundedInterpId = (string) Str::uuid();

        $ack = $this->seedEvidenceAcknowledgment($rmId, 'da_receipt');
        $boundedRestrictions = [
            'state' => 'bounded',
            'allowed_uses' => ['internal_use'],
            'event_ids' => [],
            'requesting_unit_ids' => [$this->requestingUnitId],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => $boundedInterpId,
            'source_condition_reference' => 'DA-2026-0001 line 1: internal committee distribution only, no sale',
        ];
        $uninterpretedRestrictions = [
            'state' => 'uninterpreted',
            'allowed_uses' => [],
            'event_ids' => [],
            'requesting_unit_ids' => [],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => null,
            'source_condition_reference' => 'DA-2026-0001 line 2: preferential access during a named youth summit',
        ];

        $input = $this->makeDaInput($rmId, 'RM-2026-0004', $daId, 'DA-2026-0001', 22, $ack, [
            $this->makeDaLine((string) Str::uuid(), $daLineBoundedId, '20', '20', '0', '0', '200.00', $boundedRestrictions),
            $this->makeDaLine((string) Str::uuid(), $daLineUninterpretedId, '12', '10', '2', '0', '200.00', $uninterpretedRestrictions, '2 donated shirts water-stained during transit; placed in quarantine.'),
        ]);

        $sourceContext = [
            'source_status' => 'acknowledged',
            'source_material_version' => 1,
            'lines' => [
                $daLineBoundedId => [
                    'variant_id' => $this->variantPcsId,
                    'unit_id' => $this->unitPcsId,
                    'unit_valuation_php' => '200.00',
                    'accepted_quantity' => '0',
                    'rejected_or_disputed_quantity' => '0',
                    'outstanding_quantity' => '20',
                ],
                $daLineUninterpretedId => [
                    'variant_id' => $this->variantPcsId,
                    'unit_id' => $this->unitPcsId,
                    'unit_valuation_php' => '200.00',
                    'accepted_quantity' => '0',
                    'rejected_or_disputed_quantity' => '0',
                    'outstanding_quantity' => '10',
                ],
                $daLineOpenOtherId => [
                    'variant_id' => $this->variantPcsId,
                    'unit_id' => $this->unitPcsId,
                    'unit_valuation_php' => '200.00',
                    'accepted_quantity' => '0',
                    'rejected_or_disputed_quantity' => '0',
                    'outstanding_quantity' => '5',
                ],
            ],
        ];

        $committedAt = CarbonImmutable::parse('2026-11-27T10:20:00.000000Z');
        $result = DB::transaction(fn () => app(PrepareReceivingInventoryParticipant::class)->prepare($input, $sourceContext, $committedAt));

        $this->assertSame('ready', $result['outcome']);
        $this->assertSame(23, $result['stock_version']);
        $this->assertTrue($result['emit_stock_lot_changed_event']);
        $this->assertCount(2, $result['usable_lots']);
        $this->assertCount(1, $result['quarantined_or_rejected_lots']);
        $this->assertCount(3, $result['movements']);
        $this->assertCount(1, $result['created_discrepancies']);

        $boundedLot = collect($result['usable_lots'])->firstWhere('source_line_id', $daLineBoundedId);
        $uninterpretedLot = collect($result['usable_lots'])->firstWhere('source_line_id', $daLineUninterpretedId);
        $quarantinedLot = $result['quarantined_or_rejected_lots'][0];

        $this->assertTrue($boundedLot['immediately_allocatable']);
        $this->assertSame('bounded', $boundedLot['restrictions']['state']);
        $this->assertFalse($uninterpretedLot['immediately_allocatable']);
        $this->assertSame('uninterpreted', $uninterpretedLot['restrictions']['state']);
        $this->assertSame('quarantined', $quarantinedLot['condition']);
        $this->assertFalse($quarantinedLot['immediately_allocatable']);
        $this->assertSame($quarantinedLot['lot_id'], $result['created_discrepancies'][0]['quarantined_lot_id']);
        $this->assertSame('partially_received', $result['source_line_updates'][0]['new_source_status']);

        // Stock views: uninterpreted (10) counts in usable_stockroom_on_hand (30) but is excluded from available_to_allocate (20).
        $views = app(StockViewQueryService::class)->getSevenViews($this->chapterId, $this->variantPcsId, 0);
        $this->assertSame('30', $views['usable_stockroom_on_hand']['quantity']);
        $this->assertSame('20', $views['available_to_allocate']['quantity']);
        $this->assertSame('2', $views['quarantined_rejected']['quantity']);
        $this->assertSame('0', $views['inbound_open_po']['quantity']);

        // HTTP eligibility check reflects ADR 0004 blocking cleanly.
        $this->asBrowserOfficer($this->receivingUserId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/lots/{$boundedLot['lot_id']}/eligibility")
            ->assertOk()
            ->assertJsonPath('data.eligible', true);
        $this->asBrowserOfficer($this->receivingUserId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/lots/{$uninterpretedLot['lot_id']}/eligibility")
            ->assertOk()
            ->assertJsonPath('data.eligible', false)
            ->assertJsonPath('data.blockers', ['lot_restricted']);

        // Stage 1 reservation blocks the ADR 0004 uninterpreted lot while allowing the bounded lot.
        [$rf, $rfLine] = $this->createApprovedRf($this->receivingUserId, '30');
        $prepRes = app(ReservationService::class)->prepareReservation($this->chapterId, $rf->id, $this->inventoryUserId, [
            'rf_line_id' => $rfLine->id,
            'targets' => [[
                'stock_lot_id' => $uninterpretedLot['lot_id'],
                'basis_segment_id' => $uninterpretedLot['basis_segment_id'],
                'offset_quantity' => '0',
                'quantity' => '5',
            ]],
        ]);
        $prepId = $prepRes['data']['result']['id'];
        try {
            app(ReservationService::class)->commitReservation($this->chapterId, $rf->id, $prepId, $this->inventoryUserId, [
                'reason' => 'Attempt reserve uninterpreted lot',
            ]);
            $this->fail('Expected restriction_unsupported on uninterpreted lot.');
        } catch (ContractException $ex) {
            $this->assertSame(409, $ex->statusCode);
            $this->assertSame('restriction_unsupported', $ex->errorCode);
        }

        // Strict closed 8-field stage1.stock-lot.changed.v1 outbox intents co-emitted for every posted lot.
        $outboxRows = DomainNotificationOutbox::where('chapter_id', $this->chapterId)
            ->where('event_name', 'stage1.stock-lot.changed.v1')
            ->get();
        $this->assertCount(3, $outboxRows);
        $this->assertEqualsCanonicalizing(
            [$boundedLot['lot_id'], $uninterpretedLot['lot_id'], $quarantinedLot['lot_id']],
            $outboxRows->pluck('resource_id')->all()
        );
        foreach ($outboxRows as $row) {
            $this->assertSame("private-stage1.chapter.{$this->chapterId}", $row->channel_name);
            $payload = $row->payload_json;
            $this->assertEqualsCanonicalizing([
                'event_name',
                'event_id',
                'committed_at',
                'chapter_id',
                'resource_kind',
                'resource_id',
                'resource_version',
                'material_version',
            ], array_keys($payload));
            $this->assertSame('stock_lot', $payload['resource_kind']);
            $this->assertSame(23, $payload['resource_version']);
            $this->assertSame(1, $payload['material_version']);
        }
    }

    public function test_da_rm_validation_and_atomic_rollback_on_outer_transaction_failure(): void
    {
        $daId = (string) Str::uuid();
        $daLineId = (string) Str::uuid();
        $rmId = (string) Str::uuid();
        $ack = $this->seedEvidenceAcknowledgment($rmId, 'da_receipt');

        $ctx = [
            'source_status' => 'acknowledged',
            'source_material_version' => 1,
            'lines' => [
                $daLineId => [
                    'variant_id' => $this->variantPcsId,
                    'unit_id' => $this->unitPcsId,
                    'unit_valuation_php' => '200.00',
                    'accepted_quantity' => '0',
                    'rejected_or_disputed_quantity' => '0',
                    'outstanding_quantity' => '10',
                ],
            ],
        ];

        // 1. DA-RM line cannot set resolves_discrepancy_id.
        $badDiscrepancyLink = $this->makeDaLine((string) Str::uuid(), $daLineId, '10', '10', '0', '0', '200.00', [
            'state' => 'unrestricted',
            'allowed_uses' => [],
            'event_ids' => [],
            'requesting_unit_ids' => [],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => null,
            'source_condition_reference' => null,
        ], null, (string) Str::uuid());
        $res1 = DB::transaction(fn () => app(PrepareReceivingInventoryParticipant::class)->prepare(
            $this->makeDaInput($rmId, 'RM-2026-0005', $daId, 'DA-2026-0002', 22, $ack, [$badDiscrepancyLink]),
            $ctx
        ));
        $this->assertSame(['outcome' => 'rejected', 'reason' => 'source_not_eligible'], $res1);

        // 2. Overdelivery beyond DA line outstanding_quantity blocked.
        $overLine = $this->makeDaLine((string) Str::uuid(), $daLineId, '11', '11', '0', '0', '200.00', [
            'state' => 'uninterpreted',
            'allowed_uses' => [],
            'event_ids' => [],
            'requesting_unit_ids' => [],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => null,
            'source_condition_reference' => 'DA condition note',
        ]);
        $res2 = DB::transaction(fn () => app(PrepareReceivingInventoryParticipant::class)->prepare(
            $this->makeDaInput($rmId, 'RM-2026-0005', $daId, 'DA-2026-0002', 22, $ack, [$overLine]),
            $ctx
        ));
        $this->assertSame(['outcome' => 'rejected', 'reason' => 'substitution_or_overdelivery_blocked'], $res2);

        // 3. Abort inside caller transaction rolls back lots, movements, and outbox intents atomically.
        $validLine = $this->makeDaLine((string) Str::uuid(), $daLineId, '10', '10', '0', '0', '200.00', [
            'state' => 'uninterpreted',
            'allowed_uses' => [],
            'event_ids' => [],
            'requesting_unit_ids' => [],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => null,
            'source_condition_reference' => 'DA condition note',
        ]);
        try {
            DB::transaction(function () use ($rmId, $daId, $ack, $validLine, $ctx): void {
                app(PrepareReceivingInventoryParticipant::class)->prepare(
                    $this->makeDaInput($rmId, 'RM-2026-0005', $daId, 'DA-2026-0002', 22, $ack, [$validLine]),
                    $ctx
                );
                throw new RuntimeException('Simulated Leader commit failure');
            });
            $this->fail('Expected outer transaction rollback.');
        } catch (RuntimeException $e) {
            $this->assertSame('Simulated Leader commit failure', $e->getMessage());
        }

        $this->assertSame(0, InventoryLot::count());
        $this->assertSame(0, InventoryMovement::count());
        $this->assertSame(0, DomainNotificationOutbox::count());
        $this->assertSame(22, (int) ChapterOpeningGuard::where('chapter_id', $this->chapterId)->value('stock_version'));
    }

    public function test_apply_lot_restriction_resolution_updates_matching_segments_preserves_holds_and_co_emits_outbox(): void
    {
        $daId = (string) Str::uuid();
        $daLineBoundedId = (string) Str::uuid();
        $daLineUninterpretedId = (string) Str::uuid();
        $daLineUnpostedId = (string) Str::uuid();
        $rmId = (string) Str::uuid();

        $boundedRestrictions = [
            'state' => 'bounded',
            'allowed_uses' => ['internal_use'],
            'event_ids' => [],
            'requesting_unit_ids' => [$this->requestingUnitId],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => (string) Str::uuid(),
            'source_condition_reference' => 'DA line 1: internal use only',
        ];
        $uninterpretedRestrictions = [
            'state' => 'uninterpreted',
            'allowed_uses' => [],
            'event_ids' => [],
            'requesting_unit_ids' => [],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => null,
            'source_condition_reference' => 'DA line 2: youth summit only',
        ];

        $ack = $this->seedEvidenceAcknowledgment($rmId, 'da_receipt');
        $prepResult = DB::transaction(fn () => app(PrepareReceivingInventoryParticipant::class)->prepare(
            $this->makeDaInput($rmId, 'RM-2026-0006', $daId, 'DA-2026-0003', 22, $ack, [
                $this->makeDaLine((string) Str::uuid(), $daLineBoundedId, '20', '20', '0', '0', '200.00', $boundedRestrictions),
                $this->makeDaLine((string) Str::uuid(), $daLineUninterpretedId, '12', '10', '2', '0', '200.00', $uninterpretedRestrictions, '2 damaged transit shirts.'),
            ]),
            [
                'source_status' => 'acknowledged',
                'source_material_version' => 1,
                'lines' => [
                    $daLineBoundedId => ['variant_id' => $this->variantPcsId, 'unit_id' => $this->unitPcsId, 'unit_valuation_php' => '200.00', 'accepted_quantity' => '0', 'rejected_or_disputed_quantity' => '0', 'outstanding_quantity' => '20'],
                    $daLineUninterpretedId => ['variant_id' => $this->variantPcsId, 'unit_id' => $this->unitPcsId, 'unit_valuation_php' => '200.00', 'accepted_quantity' => '0', 'rejected_or_disputed_quantity' => '0', 'outstanding_quantity' => '10'],
                ],
            ]
        ));

        $boundedLot = collect($prepResult['usable_lots'])->firstWhere('source_line_id', $daLineBoundedId);
        $uninterpretedLot = collect($prepResult['usable_lots'])->firstWhere('source_line_id', $daLineUninterpretedId);
        $quarantinedLot = $prepResult['quarantined_or_rejected_lots'][0];

        // Reserve 5 units on bounded lot and place independent holds on both lots.
        [$rf, $rfLine] = $this->createApprovedRf($this->inventoryUserId, '5');
        $prepRes = app(ReservationService::class)->prepareReservation($this->chapterId, $rf->id, $this->inventoryUserId, [
            'rf_line_id' => $rfLine->id,
            'targets' => [[
                'stock_lot_id' => $boundedLot['lot_id'],
                'basis_segment_id' => $boundedLot['basis_segment_id'],
                'offset_quantity' => '0',
                'quantity' => '5',
            ]],
        ]);
        $resCreated = app(ReservationService::class)->commitReservation(
            $this->chapterId,
            $rf->id,
            $prepRes['data']['result']['id'],
            $this->inventoryUserId,
            ['reason' => 'Existing bounded reservation']
        );
        $reservationId = $resCreated['data']['result']['id'];

        $holdOnLineC = app(ReservationService::class)->placeHold($this->chapterId, $this->inventoryUserId, [
            'reason_code' => 'damage_review',
            'reason' => 'Independent hold on 4 units of line C',
            'targets' => [[
                'stock_lot_id' => $uninterpretedLot['lot_id'],
                'basis_segment_id' => $uninterpretedLot['basis_segment_id'],
                'offset_quantity' => '0',
                'quantity' => '4',
            ]],
        ]);
        $holdId = $holdOnLineC['data']['result']['id'];

        // Clear initial outbox rows to isolate applyLotRestrictionResolution emissions.
        DomainNotificationOutbox::query()->delete();

        // 1. Refuse uninterpreted as target state (target_locked).
        $refuseUninterpreted = DB::transaction(fn () => app(ApplyLotRestrictionResolutionParticipant::class)->apply([
            'chapter_id' => $this->chapterId,
            'da_id' => $daId,
            'da_line_id' => $daLineUninterpretedId,
            'resolution_id' => (string) Str::uuid(),
            'previous_restrictions' => $uninterpretedRestrictions,
            'restrictions' => $uninterpretedRestrictions,
        ]));
        $this->assertSame(['outcome' => 'rejected', 'reason' => 'target_locked'], $refuseUninterpreted);

        // 2. Reject stale previous_restrictions mismatch (target_locked).
        $resolvedBounded = [
            'state' => 'bounded',
            'allowed_uses' => ['internal_use'],
            'event_ids' => [],
            'requesting_unit_ids' => [$this->requestingUnitId],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => (string) Str::uuid(),
            'source_condition_reference' => 'DA line 2: youth summit only',
        ];
        $staleAttempt = DB::transaction(fn () => app(ApplyLotRestrictionResolutionParticipant::class)->apply([
            'chapter_id' => $this->chapterId,
            'da_id' => $daId,
            'da_line_id' => $daLineUninterpretedId,
            'resolution_id' => (string) Str::uuid(),
            'previous_restrictions' => $boundedRestrictions,
            'restrictions' => $resolvedBounded,
        ]));
        $this->assertSame(['outcome' => 'rejected', 'reason' => 'target_locked'], $staleAttempt);
        $this->assertSame(0, DomainNotificationOutbox::count());

        // 3. Apply resolution when zero posted stockroom segments exist for daLineUnpostedId -> ready, [], zero outbox.
        $noSegmentsResult = DB::transaction(fn () => app(ApplyLotRestrictionResolutionParticipant::class)->apply([
            'chapter_id' => $this->chapterId,
            'da_id' => $daId,
            'da_line_id' => $daLineUnpostedId,
            'resolution_id' => (string) Str::uuid(),
            'previous_restrictions' => $uninterpretedRestrictions,
            'restrictions' => $resolvedBounded,
        ]));
        $this->assertSame(['outcome' => 'ready', 'updated_lot_ids' => []], $noSegmentsResult);
        $this->assertSame(0, DomainNotificationOutbox::count());

        // 4. Valid apply on daLineUninterpretedId updates usable + quarantined lots for that line only.
        $movementCountBefore = InventoryMovement::count();
        $applyResult = DB::transaction(fn () => app(ApplyLotRestrictionResolutionParticipant::class)->apply([
            'chapter_id' => $this->chapterId,
            'da_id' => $daId,
            'da_line_id' => $daLineUninterpretedId,
            'resolution_id' => (string) Str::uuid(),
            'previous_restrictions' => $uninterpretedRestrictions,
            'restrictions' => $resolvedBounded,
        ]));

        $expectedUpdatedIds = [$uninterpretedLot['lot_id'], $quarantinedLot['lot_id']];
        sort($expectedUpdatedIds);
        $this->assertSame('ready', $applyResult['outcome']);
        $this->assertSame($expectedUpdatedIds, $applyResult['updated_lot_ids']);

        $freshLineCLot = InventoryLot::findOrFail($uninterpretedLot['lot_id']);
        $freshQuarantinedLot = InventoryLot::findOrFail($quarantinedLot['lot_id']);
        $freshLineALot = InventoryLot::findOrFail($boundedLot['lot_id']);

        // Eligibility flipped on usable lot only; quarantined stays non-allocatable; quantities & custody preserved.
        $this->assertTrue($freshLineCLot->immediately_allocatable);
        $this->assertSame(24, (int) $freshLineCLot->stock_version);
        $this->assertSame('10.000000', (string) $freshLineCLot->quantity_on_hand);
        $this->assertSame('STOCKROOM', $freshLineCLot->custody);
        $this->assertSame($resolvedBounded, $freshLineCLot->segments[0]['restrictions']);

        $this->assertFalse($freshQuarantinedLot->immediately_allocatable);
        $this->assertSame(24, (int) $freshQuarantinedLot->stock_version);
        $this->assertSame($resolvedBounded, $freshQuarantinedLot->segments[0]['restrictions']);

        // Unrelated lot A and existing StockHold & StockReservation remain untouched.
        $this->assertSame(23, (int) $freshLineALot->stock_version);
        $this->assertSame('bounded', $freshLineALot->segments[0]['restrictions']['state']);
        $this->assertSame($movementCountBefore, InventoryMovement::count());
        $this->assertSame('active', StockHold::findOrFail($holdId)->status);
        $this->assertSame('ACTIVE', StockReservation::findOrFail($reservationId)->status);
        $this->assertSame('5.000000', (string) RfReservationAllocation::where('reservation_id', $reservationId)->value('quantity'));

        // Derived availability: 30 usable on hand - 5 RF reserved - 4 StockHold on line C = 21 available_to_allocate.
        $views = app(StockViewQueryService::class)->getSevenViews($this->chapterId, $this->variantPcsId, 0);
        $this->assertSame('30', $views['usable_stockroom_on_hand']['quantity']);
        $this->assertSame('21', $views['available_to_allocate']['quantity']);

        // Outbox contains stage1.stock-lot.changed.v1 ONLY for the 2 updated lots.
        $outboxLotIds = DomainNotificationOutbox::where('chapter_id', $this->chapterId)
            ->where('event_name', 'stage1.stock-lot.changed.v1')
            ->pluck('resource_id')
            ->all();
        $this->assertEqualsCanonicalizing($expectedUpdatedIds, $outboxLotIds);

        // 5. Bounded -> unrestricted apply refinement works cleanly as well.
        $unrestricted = [
            'state' => 'unrestricted',
            'allowed_uses' => [],
            'event_ids' => [],
            'requesting_unit_ids' => [],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => null,
            'source_condition_reference' => null,
        ];
        $refineResult = DB::transaction(fn () => app(ApplyLotRestrictionResolutionParticipant::class)->apply([
            'chapter_id' => $this->chapterId,
            'da_id' => $daId,
            'da_line_id' => $daLineUninterpretedId,
            'resolution_id' => (string) Str::uuid(),
            'previous_restrictions' => $resolvedBounded,
            'restrictions' => $unrestricted,
        ]));
        $this->assertSame('ready', $refineResult['outcome']);
        $this->assertSame($expectedUpdatedIds, $refineResult['updated_lot_ids']);
        $this->assertSame('unrestricted', InventoryLot::findOrFail($uninterpretedLot['lot_id'])->segments[0]['restrictions']['state']);
    }

    /** @return array{0: InternalRf, 1: InternalRfLine} */
    private function createApprovedRf(string $requesterId, string $requestedQty): array
    {
        $rf = InternalRf::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'rf_number' => 'RF-2026-'.random_int(1000, 9999),
            'requesting_unit_id' => $this->requestingUnitId,
            'requester_user_id' => $requesterId,
            'purpose' => 'internal_use',
            'justification' => 'Day 2 restriction test RF',
            'needed_at' => now()->addDays(2),
            'status' => 'approved',
            'fulfillment_status' => 'unfulfilled',
            'version' => 1,
            'material_version' => 1,
            'progress_version' => 1,
        ]);

        $line = InternalRfLine::create([
            'id' => (string) Str::uuid(),
            'rf_id' => $rf->id,
            'line_order' => 1,
            'variant_id' => $this->variantPcsId,
            'unit_id' => $this->unitPcsId,
            'requested_quantity' => $requestedQty,
            'approved_quantity' => $requestedQty,
            'reserved_quantity' => '0',
            'issued_quantity' => '0',
        ]);

        return [$rf, $line];
    }

    /** @return array<string, mixed> */
    private function seedEvidenceAcknowledgment(string $rmId, string $purpose): array
    {
        $evidenceId = (string) Str::uuid();
        $versionId = (string) Str::uuid();
        $attachmentId = (string) Str::uuid();
        $img = imagecreatetruecolor(1, 1);
        ob_start();
        imagepng($img);
        $bytes = (string) ob_get_clean();
        imagedestroy($img);
        $sha256 = hash('sha256', $bytes);
        $path = app(PaperEvidenceStore::class)->store($this->receivingUserId, $attachmentId, $bytes, $sha256);

        EvidenceRecord::create([
            'id' => $evidenceId,
            'chapter_id' => $this->chapterId,
            'evidence_type' => $purpose,
            'purpose' => $purpose,
            'record_id' => $rmId,
            'technical_state' => 'ready',
            'created_by' => $this->receivingUserId,
        ]);

        EvidenceBlob::create([
            'id' => $attachmentId,
            'evidence_id' => $evidenceId,
            'version' => 1,
            'version_id' => $versionId,
            'position' => 1,
            'sha256_hash' => $sha256,
            'mime_type' => 'image/png',
            'file_size' => strlen($bytes),
            'payload_path' => $path,
            'created_by' => $this->receivingUserId,
        ]);

        return [
            'acknowledgment_id' => (string) Str::uuid(),
            'matched_by' => $this->receivingUserId,
            'matched_at' => '2026-11-27T10:15:00.000000Z',
            'recipient_id' => null,
            'acknowledged_at' => '2026-11-27T10:15:00.000000Z',
            'snapshot' => [
                'target' => ['purpose' => $purpose, 'record_id' => $rmId],
                'material_version' => 1,
                'sha256' => hash('sha256', $rmId),
            ],
            'bytes' => [
                'evidence_id' => $evidenceId,
                'version_id' => $versionId,
                'attachments' => [['attachment_id' => $attachmentId, 'sha256' => $sha256]],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function makeDaInput(
        string $rmId,
        string $rmRef,
        string $daId,
        string $daRef,
        int $stockVersion,
        array $acknowledgment,
        array $lines
    ): array {
        return [
            'actor_id' => $this->receivingUserId,
            'chapter_id' => $this->chapterId,
            'operation_id' => (string) Str::uuid(),
            'source_kind' => 'da_rm',
            'rm_id' => $rmId,
            'rm_reference' => $rmRef,
            'rm_material_version' => 1,
            'source_id' => $daId,
            'source_reference' => $daRef,
            'source_material_version' => 1,
            'donor_id' => null,
            'donor_name' => 'Cebu Civic Youth Foundation',
            'location_id' => $this->locationId,
            'current_stock_version' => $stockVersion,
            'acknowledgment' => $acknowledgment,
            'lines' => $lines,
        ];
    }

    /** @return array<string, mixed> */
    private function makeDaLine(
        string $rmLineId,
        string $sourceLineId,
        string $delivered,
        string $accepted,
        string $damaged,
        string $rejected,
        string $unitValuationPhp,
        array $restrictions,
        ?string $discrepancyNotes = null,
        ?string $resolvesDiscrepancyId = null
    ): array {
        return [
            'rm_line_id' => $rmLineId,
            'source_line_id' => $sourceLineId,
            'variant_id' => $this->variantPcsId,
            'variant_material_version' => 1,
            'item_id' => $this->itemId,
            'unit_id' => $this->unitPcsId,
            'unit_material_version' => 1,
            'quantity_scale' => 0,
            'historical_variant_label' => 'Chapter Shirt / Medium',
            'delivered_quantity' => $delivered,
            'accepted_quantity' => $accepted,
            'damaged_quantity' => $damaged,
            'rejected_quantity' => $rejected,
            'unit_valuation_php' => $unitValuationPhp,
            'restrictions' => $restrictions,
            'discrepancy_notes' => $discrepancyNotes,
            'resolves_discrepancy_id' => $resolvesDiscrepancyId,
        ];
    }
}
