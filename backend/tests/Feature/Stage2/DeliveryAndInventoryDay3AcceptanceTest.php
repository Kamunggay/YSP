<?php

namespace Tests\Feature\Stage2;

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
use App\Models\InventoryLot;
use App\Models\User;
use App\Services\Evidence\PaperEvidenceStore;
use App\Services\Inventory\Participants\ApplyLotRestrictionResolutionParticipant;
use App\Services\Inventory\Participants\PrepareReceivingInventoryParticipant;
use App\Services\Inventory\ReservationService;
use App\Services\Inventory\StockViewQueryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\TestCase;

class DeliveryAndInventoryDay3AcceptanceTest extends TestCase
{
    use AuthenticatesBrowserOfficer;
    use RefreshDatabase;

    private string $chapterId;

    private string $requesterUnitAId;

    private string $requesterUnitBId;

    private string $approverId;

    private string $approverGrantId;

    private string $custodianId;

    private string $headUserId;

    private string $financeUserId;

    private string $unitAId;

    private string $unitBId;

    private string $unitPcsId;

    private string $itemId;

    private string $variantPcsId;

    private string $locationId;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('evidence');

        $this->chapterId = (string) Str::uuid();
        $this->requesterUnitAId = (string) Str::uuid();
        $this->requesterUnitBId = (string) Str::uuid();
        $this->approverId = (string) Str::uuid();
        $this->custodianId = (string) Str::uuid();
        $this->headUserId = (string) Str::uuid();
        $this->financeUserId = (string) Str::uuid();
        $this->unitAId = (string) Str::uuid();
        $this->unitBId = (string) Str::uuid();

        Chapter::create([
            'id' => $this->chapterId,
            'code' => 'SYN-CEBU',
            'name' => 'Cebu Chapter',
            'status' => 'live',
            'version' => 1,
        ]);

        foreach ([
            $this->requesterUnitAId => ['reqa@example.invalid', 'Requester Unit A', ['COMMITTEE_REQUESTER']],
            $this->requesterUnitBId => ['reqb@example.invalid', 'Requester Unit B', ['COMMITTEE_REQUESTER']],
            $this->approverId => ['app@example.invalid', 'Approver', ['RF_APPROVER']],
            $this->custodianId => ['cust@example.invalid', 'Receiver & Custodian', ['RECEIVING', 'INVENTORY_CUSTODIAN', 'INVENTORY', 'DISPATCH']],
            $this->headUserId => ['head@example.invalid', 'Chapter Head', ['CHAPTER_HEAD']],
            $this->financeUserId => ['fin@example.invalid', 'Finance', ['FINANCE']],
        ] as $uid => [$email, $name, $duties]) {
            User::create([
                'id' => $uid,
                'public_id' => $email,
                'name' => $name,
                'email' => $email,
                'password_hash' => hash('sha256', 'Pass123!'),
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
                $grant = DutyGrant::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $this->chapterId,
                    'user_id' => $uid,
                    'duty_code' => $duty,
                    'status' => 'active',
                    'is_alternate' => false,
                    'valid_from' => now()->subDay(),
                    'version' => 1,
                ]);
                if ($uid === $this->approverId && $duty === 'RF_APPROVER') {
                    $this->approverGrantId = $grant->id;
                }
            }
        }

        // Seed base Stage 1 policies with approval route for Unit A (and add Unit B route right below).
        $this->seedEffectiveStage1Policies(
            $this->chapterId,
            $this->headUserId,
            $this->financeUserId,
            $this->unitAId,
            $this->approverGrantId
        );

        ChapterOpeningGuard::updateOrCreate(
            ['chapter_id' => $this->chapterId],
            [
                'stock_version' => 10,
                'posted_rm_id' => (string) Str::uuid(),
                'posted_ipc_id' => (string) Str::uuid(),
                'outcome_id' => (string) Str::uuid(),
                'outcome_json' => ['stock_version' => 10],
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

    public function test_da_rm_mixed_restrictions_allocation_review_resolution_and_ac15_repeated_actual_issue(): void
    {
        $daId = (string) Str::uuid();
        $lineUnrestrictedId = (string) Str::uuid();
        $lineBoundedId = (string) Str::uuid();
        $lineUninterpretedId = (string) Str::uuid();
        $rmId = (string) Str::uuid();

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
        $boundedUnitA = [
            'state' => 'bounded',
            'allowed_uses' => ['internal_use'],
            'event_ids' => [],
            'requesting_unit_ids' => [$this->unitAId],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => (string) Str::uuid(),
            'source_condition_reference' => 'DA line 2: Unit A distribution only',
        ];
        $uninterpreted = [
            'state' => 'uninterpreted',
            'allowed_uses' => [],
            'event_ids' => [],
            'requesting_unit_ids' => [],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => null,
            'source_condition_reference' => 'DA line 3: youth summit access pending review',
        ];

        $ack = $this->seedPngEvidenceAcknowledgment($rmId, 'da_receipt', $this->custodianId);
        $prep = DB::transaction(fn () => app(PrepareReceivingInventoryParticipant::class)->prepare(
            [
                'actor_id' => $this->custodianId,
                'chapter_id' => $this->chapterId,
                'operation_id' => (string) Str::uuid(),
                'source_kind' => 'da_rm',
                'rm_id' => $rmId,
                'rm_reference' => 'SYN-RM-2026-000011',
                'rm_material_version' => 1,
                'source_id' => $daId,
                'source_reference' => 'DA-2026-0001',
                'source_material_version' => 1,
                'donor_id' => null,
                'donor_name' => 'Cebu Civic Youth Foundation',
                'location_id' => $this->locationId,
                'current_stock_version' => 10,
                'acknowledgment' => $ack,
                'lines' => [
                    $this->makeDaLine((string) Str::uuid(), $lineUnrestrictedId, '10', '10', '0', '0', $unrestricted),
                    $this->makeDaLine((string) Str::uuid(), $lineBoundedId, '20', '20', '0', '0', $boundedUnitA),
                    $this->makeDaLine((string) Str::uuid(), $lineUninterpretedId, '17', '15', '2', '0', $uninterpreted, '2 damaged transit shirts.'),
                ],
            ],
            [
                'source_status' => 'acknowledged',
                'source_material_version' => 1,
                'lines' => [
                    $lineUnrestrictedId => ['variant_id' => $this->variantPcsId, 'unit_id' => $this->unitPcsId, 'unit_valuation_php' => '200.00', 'accepted_quantity' => '0', 'rejected_or_disputed_quantity' => '0', 'outstanding_quantity' => '10'],
                    $lineBoundedId => ['variant_id' => $this->variantPcsId, 'unit_id' => $this->unitPcsId, 'unit_valuation_php' => '200.00', 'accepted_quantity' => '0', 'rejected_or_disputed_quantity' => '0', 'outstanding_quantity' => '20'],
                    $lineUninterpretedId => ['variant_id' => $this->variantPcsId, 'unit_id' => $this->unitPcsId, 'unit_valuation_php' => '200.00', 'accepted_quantity' => '0', 'rejected_or_disputed_quantity' => '0', 'outstanding_quantity' => '15'],
                ],
            ]
        ));

        $unrestrictedLot = InventoryLot::findOrFail(collect($prep['usable_lots'])->firstWhere('source_line_id', $lineUnrestrictedId)['lot_id']);
        $boundedLot = InventoryLot::findOrFail(collect($prep['usable_lots'])->firstWhere('source_line_id', $lineBoundedId)['lot_id']);
        $uninterpretedLot = InventoryLot::findOrFail(collect($prep['usable_lots'])->firstWhere('source_line_id', $lineUninterpretedId)['lot_id']);

        // 1. /allocation-review excludes ADR 0004 uninterpreted lot while exposing unrestricted + bounded lots.
        $rfA = $this->createApprovedRfForUnit($this->requesterUnitAId, $this->unitAId, '15');
        $reviewResp = $this->asBrowserOfficer($this->custodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfA['id']}/allocation-review")
            ->assertOk();
        $candidateIds = collect($reviewResp->json('data.lines.0.candidate_lots'))->pluck('stock_lot_id')->all();
        $this->assertContains($unrestrictedLot->id, $candidateIds);
        $this->assertContains($boundedLot->id, $candidateIds);
        $this->assertNotContains($uninterpretedLot->id, $candidateIds);

        // 2. Bounded restriction excludes Unit B on reservation commit (409 restriction_unsupported).
        $rfB = InternalRf::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'rf_number' => 'SYN-RF-2026-000999',
            'requesting_unit_id' => $this->unitBId,
            'requester_user_id' => $this->requesterUnitBId,
            'purpose' => 'internal_use',
            'justification' => 'Unit B request',
            'needed_at' => now()->addDays(2),
            'status' => 'approved',
            'fulfillment_status' => 'unfulfilled',
            'version' => 1,
            'material_version' => 1,
            'progress_version' => 1,
        ]);
        $rfBLine = $rfB->lines()->create([
            'id' => (string) Str::uuid(),
            'line_order' => 1,
            'variant_id' => $this->variantPcsId,
            'unit_id' => $this->unitPcsId,
            'requested_quantity' => '5',
            'approved_quantity' => '5',
            'reserved_quantity' => '0',
            'issued_quantity' => '0',
        ]);

        $prepB = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfB->id}/reservation-preparations", [
                'expected_rf_version' => 1,
                'expected_rf_material_version' => 1,
                'expected_rf_progress_version' => 1,
                'rf_line_id' => $rfBLine->id,
                'targets' => [[
                    'stock_lot_id' => $boundedLot->id,
                    'basis_segment_id' => $boundedLot->basis_segment_id,
                    'offset_quantity' => '0',
                    'quantity' => '5',
                ]],
                'override_policy_id' => null,
                'reason' => 'Unit B tries bounded Unit A lot',
            ])->assertStatus(201)->json('data.result');

        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfB->id}/reservation-preparations/{$prepB['id']}/commit", [
                'expected_preparation_version' => 1,
                'expected_rf_version' => 1,
                'expected_rf_material_version' => 1,
                'expected_rf_progress_version' => 1,
            ])->assertStatus(409)->assertJsonPath('error.code', 'restriction_unsupported');

        // 3. Unit A reserves [0, 5) on boundedLot; then restriction resolution narrows boundedLot to Unit B -> ActualIssue::post refuses (409 restriction_unsupported).
        $rfAResBounded = $this->reserveViaHttp($rfA, $rfA['lines'][0]['id'], $boundedLot, '0', '5');
        $rfAFresh = InternalRf::with('lines')->findOrFail($rfA['id']);

        $boundedUnitB = [
            'state' => 'bounded',
            'allowed_uses' => ['internal_use'],
            'event_ids' => [],
            'requesting_unit_ids' => [$this->unitBId],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => (string) Str::uuid(),
            'source_condition_reference' => 'DA line 2: narrowed to Unit B',
        ];
        DB::transaction(fn () => app(ApplyLotRestrictionResolutionParticipant::class)->apply([
            'chapter_id' => $this->chapterId,
            'da_id' => $daId,
            'da_line_id' => $lineBoundedId,
            'resolution_id' => (string) Str::uuid(),
            'previous_restrictions' => $boundedUnitA,
            'restrictions' => $boundedUnitB,
        ]));
        $boundedLot->refresh();

        $blockedIssue = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfA['id']}/actual-issues", [
                'expected_rf_version' => $rfAFresh->version,
                'expected_rf_material_version' => $rfAFresh->material_version,
                'expected_rf_progress_version' => $rfAFresh->progress_version,
                'recipient_id' => $this->requesterUnitAId,
                'recipient_name' => 'Unit A Recipient',
                'lines' => [[
                    'rf_line_id' => $rfA['lines'][0]['id'],
                    'reservation_id' => $rfAResBounded['id'],
                    'expected_reservation_version' => $rfAResBounded['version'],
                    'expected_reservation_material_version' => $rfAResBounded['material_version'],
                    'targets' => [[
                        'stock_lot_id' => $boundedLot->id,
                        'basis_segment_id' => $boundedLot->basis_segment_id,
                        'offset_quantity' => '0',
                        'quantity' => '5',
                        'expected_lot_material_version' => $boundedLot->material_version,
                        'expected_stock_version' => $boundedLot->stock_version,
                    ]],
                ]],
                'handed_over_at' => now('UTC')->subMinutes(2)->format('Y-m-d\TH:i:s.u\Z'),
                'acknowledged_at' => now('UTC')->subMinute()->format('Y-m-d\TH:i:s.u\Z'),
                'recipient_accepts_partial' => true,
            ])->assertStatus(201)->json('data');

        $issueBytes = $this->seedPngByteBinding($blockedIssue['id'], 'actual_issue', $this->custodianId);
        $issueMatched = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$blockedIssue['id']}/acknowledgments", [
                'expected_version' => $blockedIssue['version'],
                'expected_material_version' => $blockedIssue['material_version'],
                'expected_snapshot' => $blockedIssue['snapshot'],
                'evidence' => $issueBytes,
                'matches_paper' => true,
            ])->assertOk()->json('data.result');

        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$blockedIssue['id']}/post", [
                'expected_version' => $issueMatched['version'],
                'expected_material_version' => $issueMatched['material_version'],
                'expected_rf_version' => $rfAFresh->version,
                'expected_rf_material_version' => $rfAFresh->material_version,
                'expected_rf_progress_version' => $rfAFresh->progress_version,
                'acknowledgment_id' => $issueMatched['acknowledgment']['acknowledgment_id'],
                'current_sources' => [[
                    'reservation_id' => $rfAResBounded['id'],
                    'expected_version' => $rfAResBounded['version'],
                    'expected_material_version' => $rfAResBounded['material_version'],
                    'targets' => [[
                        'stock_lot_id' => $boundedLot->id,
                        'basis_segment_id' => $boundedLot->basis_segment_id,
                        'offset_quantity' => '0',
                        'quantity' => '5',
                        'expected_lot_material_version' => $boundedLot->material_version,
                        'expected_stock_version' => $boundedLot->stock_version,
                    ]],
                ]],
            ])->assertStatus(409)->assertJsonPath('error.code', 'restriction_unsupported');

        // 4. Resolve uninterpretedLot -> bounded for Unit A with an independent hold [0, 5), reserve [5, 15), and post 2 partial actual issues (4 + 6).
        app(ReservationService::class)->placeHold($this->chapterId, $this->custodianId, [
            'reason_code' => 'damage_review',
            'reason' => 'Independent hold on [0, 5)',
            'targets' => [[
                'stock_lot_id' => $uninterpretedLot->id,
                'basis_segment_id' => $uninterpretedLot->basis_segment_id,
                'offset_quantity' => '0',
                'quantity' => '5',
            ]],
        ]);

        DB::transaction(fn () => app(ApplyLotRestrictionResolutionParticipant::class)->apply([
            'chapter_id' => $this->chapterId,
            'da_id' => $daId,
            'da_line_id' => $lineUninterpretedId,
            'resolution_id' => (string) Str::uuid(),
            'previous_restrictions' => $uninterpreted,
            'restrictions' => [
                'state' => 'bounded',
                'allowed_uses' => ['internal_use'],
                'event_ids' => [],
                'requesting_unit_ids' => [$this->unitAId],
                'effective_from' => null,
                'effective_until' => null,
                'interpretation_id' => (string) Str::uuid(),
                'source_condition_reference' => 'DA line 3: youth summit access pending review',
            ],
        ]));
        $uninterpretedLot->refresh();

        $reviewAfter = $this->asBrowserOfficer($this->custodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfA['id']}/allocation-review")
            ->assertOk();
        $this->assertContains($uninterpretedLot->id, collect($reviewAfter->json('data.lines.0.candidate_lots'))->pluck('stock_lot_id')->all());

        $resUnlocked = $this->reserveViaHttp($rfA, $rfA['lines'][0]['id'], $uninterpretedLot, '5', '10');
        $this->postPartialIssueViaHttp($rfA['id'], $rfA['lines'][0]['id'], $resUnlocked, $uninterpretedLot, '5', '4');

        $resUnlockedUpdated = $this->asBrowserOfficer($this->custodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfA['id']}/reservations/{$resUnlocked['id']}")
            ->assertOk()->json('data');
        $uninterpretedLot->refresh();
        $this->postPartialIssueViaHttp($rfA['id'], $rfA['lines'][0]['id'], $resUnlockedUpdated, $uninterpretedLot, '9', '6');

        // 5. Three authenticated officer sessions & instant revocation fencing + closed 8-field stock-lot outbox verification.
        $this->asBrowserOfficer($this->custodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/lots/{$uninterpretedLot->id}")
            ->assertOk()
            ->assertJsonPath('data.quantity', '5');
        $this->asBrowserOfficer($this->requesterUnitAId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfA['id']}")
            ->assertOk();
        $this->asBrowserOfficer($this->approverId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfA['id']}")
            ->assertOk();

        DutyGrant::where('chapter_id', $this->chapterId)->where('user_id', $this->custodianId)->delete();
        $this->asBrowserOfficer($this->custodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/stock/lots/{$uninterpretedLot->id}")
            ->assertStatus(403);
        DutyGrant::where('chapter_id', $this->chapterId)->where('user_id', $this->approverId)->delete();
        $this->asBrowserOfficer($this->approverId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfA['id']}")
            ->assertStatus(403);

        $latestOutbox = DomainNotificationOutbox::where('chapter_id', $this->chapterId)
            ->where('event_name', 'stage1.stock-lot.changed.v1')
            ->where('resource_id', $uninterpretedLot->id)
            ->latest('created_at')
            ->firstOrFail();
        $this->assertSame("private-stage1.chapter.{$this->chapterId}", $latestOutbox->channel_name);
        $this->assertSame('stock_lot', $latestOutbox->payload_json['resource_kind']);

        // Stock summary remains consistent: 45 posted usable - 10 issued = 35 usable on hand; (35 - 5 reserved - 5 hold) = 25 available.
        $finalViews = app(StockViewQueryService::class)->getSevenViews($this->chapterId, $this->variantPcsId, 0);
        $this->assertSame('35', $finalViews['usable_stockroom_on_hand']['quantity']);
        $this->assertSame('25', $finalViews['available_to_allocate']['quantity']);
        $this->assertSame('2', $finalViews['quarantined_rejected']['quantity']);
    }

    private function createApprovedRfForUnit(string $requesterId, string $unitId, string $qty): array
    {
        $rf = $this->asBrowserOfficer($requesterId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs", [
                'purpose' => 'internal_use',
                'requesting_unit_id' => $unitId,
                'event_id' => null,
                'needed_at' => '2026-11-30T09:00:00Z',
                'justification' => 'Day 3 DA-RM fulfillment',
                'lines' => [[
                    'line_id' => null,
                    'variant_id' => $this->variantPcsId,
                    'unit_id' => $this->unitPcsId,
                    'requested_quantity' => $qty,
                ]],
            ])->assertStatus(201)->json('data.result');

        $this->asBrowserOfficer($requesterId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf['id']}/submit", [
                'expected_version' => 1,
                'expected_material_version' => 1,
            ])->assertOk();

        return $this->asBrowserOfficer($this->approverId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf['id']}/approve", [
                'expected_version' => 2,
                'expected_material_version' => 1,
            ])->assertOk()->json('data.result');
    }

    private function reserveViaHttp(array $rf, string $rfLineId, InventoryLot $lot, string $offset, string $qty): array
    {
        $freshRf = InternalRf::findOrFail($rf['id']);
        $lot->refresh();

        $prep = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$freshRf->id}/reservation-preparations", [
                'expected_rf_version' => $freshRf->version,
                'expected_rf_material_version' => $freshRf->material_version,
                'expected_rf_progress_version' => $freshRf->progress_version,
                'rf_line_id' => $rfLineId,
                'targets' => [[
                    'stock_lot_id' => $lot->id,
                    'basis_segment_id' => $lot->basis_segment_id,
                    'offset_quantity' => $offset,
                    'quantity' => $qty,
                    'expected_lot_material_version' => $lot->material_version,
                    'expected_stock_version' => $lot->stock_version,
                ]],
                'override_policy_id' => null,
                'reason' => "Reserve {$qty}",
            ])->assertStatus(201)->json('data.result');

        return $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$freshRf->id}/reservation-preparations/{$prep['id']}/commit", [
                'expected_preparation_version' => 1,
                'expected_rf_version' => $freshRf->version,
                'expected_rf_material_version' => $freshRf->material_version,
                'expected_rf_progress_version' => $freshRf->progress_version,
            ])->assertStatus(201)->json('data.result');
    }

    private function postPartialIssueViaHttp(
        string $rfId,
        string $rfLineId,
        array $reservation,
        InventoryLot $lot,
        string $offset,
        string $qty
    ): void {
        $rf = InternalRf::findOrFail($rfId);
        $lot->refresh();

        $issue = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/actual-issues", [
                'expected_rf_version' => $rf->version,
                'expected_rf_material_version' => $rf->material_version,
                'expected_rf_progress_version' => $rf->progress_version,
                'recipient_id' => $this->requesterUnitAId,
                'recipient_name' => 'Unit A Recipient',
                'lines' => [[
                    'rf_line_id' => $rfLineId,
                    'reservation_id' => $reservation['id'],
                    'expected_reservation_version' => $reservation['version'],
                    'expected_reservation_material_version' => $reservation['material_version'],
                    'targets' => [[
                        'stock_lot_id' => $lot->id,
                        'basis_segment_id' => $lot->basis_segment_id,
                        'offset_quantity' => $offset,
                        'quantity' => $qty,
                        'expected_lot_material_version' => $lot->material_version,
                        'expected_stock_version' => $lot->stock_version,
                    ]],
                ]],
                'handed_over_at' => now('UTC')->subMinutes(2)->format('Y-m-d\TH:i:s.u\Z'),
                'acknowledged_at' => now('UTC')->subMinute()->format('Y-m-d\TH:i:s.u\Z'),
                'recipient_accepts_partial' => true,
            ])->assertStatus(201)->json('data');

        $bytes = $this->seedPngByteBinding($issue['id'], 'actual_issue', $this->custodianId);
        $matched = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issue['id']}/acknowledgments", [
                'expected_version' => $issue['version'],
                'expected_material_version' => $issue['material_version'],
                'expected_snapshot' => $issue['snapshot'],
                'evidence' => $bytes,
                'matches_paper' => true,
            ])->assertOk()->json('data.result');

        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issue['id']}/post", [
                'expected_version' => $matched['version'],
                'expected_material_version' => $matched['material_version'],
                'expected_rf_version' => $rf->version,
                'expected_rf_material_version' => $rf->material_version,
                'expected_rf_progress_version' => $rf->progress_version,
                'acknowledgment_id' => $matched['acknowledgment']['acknowledgment_id'],
                'current_sources' => [[
                    'reservation_id' => $reservation['id'],
                    'expected_version' => $reservation['version'],
                    'expected_material_version' => $reservation['material_version'],
                    'targets' => [[
                        'stock_lot_id' => $lot->id,
                        'basis_segment_id' => $lot->basis_segment_id,
                        'offset_quantity' => $offset,
                        'quantity' => $qty,
                        'expected_lot_material_version' => $lot->material_version,
                        'expected_stock_version' => $lot->stock_version,
                    ]],
                ]],
            ])->assertOk()->assertJsonPath('status', 'posted');
    }

    /** @return array<string, mixed> */
    private function seedPngByteBinding(string $recordId, string $purpose, string $actorId): array
    {
        $evidenceId = (string) Str::uuid();
        $versionId = (string) Str::uuid();
        $attachmentId = (string) Str::uuid();
        $img = imagecreatetruecolor(1, 1);
        ob_start();
        imagepng($img);
        $raw = (string) ob_get_clean();
        imagedestroy($img);
        $sha256 = hash('sha256', $raw);
        $path = app(PaperEvidenceStore::class)->store($actorId, $attachmentId, $raw, $sha256);

        EvidenceRecord::create([
            'id' => $evidenceId,
            'chapter_id' => $this->chapterId,
            'evidence_type' => $purpose,
            'purpose' => $purpose,
            'record_id' => $recordId,
            'technical_state' => 'ready',
            'created_by' => $actorId,
        ]);

        EvidenceBlob::create([
            'id' => $attachmentId,
            'evidence_id' => $evidenceId,
            'version' => 1,
            'version_id' => $versionId,
            'position' => 1,
            'sha256_hash' => $sha256,
            'mime_type' => 'image/png',
            'file_size' => strlen($raw),
            'payload_path' => $path,
            'created_by' => $actorId,
        ]);

        return [
            'evidence_id' => $evidenceId,
            'version_id' => $versionId,
            'attachments' => [['attachment_id' => $attachmentId, 'sha256' => $sha256]],
        ];
    }

    /** @return array<string, mixed> */
    private function seedPngEvidenceAcknowledgment(string $rmId, string $purpose, string $actorId): array
    {
        return [
            'acknowledgment_id' => (string) Str::uuid(),
            'matched_by' => $actorId,
            'matched_at' => '2026-11-27T10:15:00.000000Z',
            'recipient_id' => null,
            'acknowledged_at' => '2026-11-27T10:15:00.000000Z',
            'snapshot' => [
                'target' => ['purpose' => $purpose, 'record_id' => $rmId],
                'material_version' => 1,
                'sha256' => hash('sha256', $rmId),
            ],
            'bytes' => $this->seedPngByteBinding($rmId, $purpose, $actorId),
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
        array $restrictions,
        ?string $notes = null
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
            'unit_valuation_php' => '200.00',
            'restrictions' => $restrictions,
            'discrepancy_notes' => $notes,
            'resolves_discrepancy_id' => null,
        ];
    }
}
