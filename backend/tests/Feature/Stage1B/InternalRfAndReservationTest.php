<?php

namespace Tests\Feature\Stage1B;

use App\Models\ActualIssue;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use App\Models\InternalRf;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\StockHold;
use App\Models\StockReservation;
use App\Models\User;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Inventory\PhysicalPostingService;
use App\Services\Inventory\StockViewQueryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class InternalRfAndReservationTest extends TestCase
{
    use RefreshDatabase;

    private string $chapterId;

    private string $foreignChapterId;

    private string $requesterId;

    private string $approverId;

    private string $custodianId;

    private string $otherCustodianId;

    private string $unitId;

    private string $itemId;

    private string $variantId;

    private string $locationId;

    private string $requestingUnitId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->chapterId = (string) Str::uuid();
        $this->foreignChapterId = (string) Str::uuid();
        $this->requesterId = (string) Str::uuid();
        $this->approverId = (string) Str::uuid();
        $this->custodianId = (string) Str::uuid();
        $this->otherCustodianId = (string) Str::uuid();
        $this->requestingUnitId = (string) Str::uuid();

        Chapter::create([
            'id' => $this->chapterId,
            'code' => 'SYN-CEB',
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
            $this->requesterId => ['requester@example.invalid', 'Requester', ['COMMITTEE_REQUESTER', 'RF_APPROVER']],
            $this->approverId => ['approver@example.invalid', 'Approver', ['RF_APPROVER']],
            $this->custodianId => ['custodian@example.invalid', 'Custodian', ['INVENTORY_CUSTODIAN', 'INVENTORY']],
            $this->otherCustodianId => ['custodian2@example.invalid', 'Other Custodian', ['INVENTORY_CUSTODIAN', 'INVENTORY']],
        ];

        foreach ($users as $uid => [$email, $name, $duties]) {
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
            'code' => 'ITEM-KIT',
            'name' => 'Training Kit',
            'unit_id' => $this->unitId,
            'state' => 'active',
            'material_version' => 1,
        ]);

        $this->variantId = (string) Str::uuid();
        CatalogueVariant::create([
            'id' => $this->variantId,
            'chapter_id' => $this->chapterId,
            'item_id' => $this->itemId,
            'sku' => 'VAR-KIT-01',
            'name' => 'Training Kit Standard',
            'label' => 'Training Kit Standard',
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

    private function seedLot(int $qty, string $lotCode = 'LOT-A'): InventoryLot
    {
        $posting = app(PhysicalPostingService::class)->createPosting(
            $this->chapterId,
            'IPC',
            (string) Str::uuid(),
            $this->custodianId,
            [[
                'variant_id' => $this->variantId,
                'unit_id' => $this->unitId,
                'location_id' => $this->locationId,
                'condition' => 'USABLE',
                'custody' => 'STOCKROOM',
                'lot_code' => $lotCode,
                'quantity' => $qty,
                'quantity_scale' => 0,
            ]]
        );

        return InventoryLot::where('chapter_id', $this->chapterId)
            ->where('lot_code', $lotCode)
            ->firstOrFail();
    }

    private function createAndApproveRf(int $qty): array
    {
        $createResp = $this->withHeaders([
            'X-User-Id' => $this->requesterId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs", [
            'purpose' => 'internal_use',
            'requesting_unit_id' => $this->requestingUnitId,
            'event_id' => null,
            'needed_at' => '2026-11-25T08:00:00Z',
            'justification' => 'Committee workshop supplies',
            'lines' => [[
                'line_id' => null,
                'variant_id' => $this->variantId,
                'unit_id' => $this->unitId,
                'requested_quantity' => (string) $qty,
            ]],
        ])->assertStatus(201);

        $rfId = $createResp->json('data.rf_id');

        $submitResp = $this->withHeaders([
            'X-User-Id' => $this->requesterId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/submit", [
            'expected_version' => 1,
            'expected_material_version' => 1,
        ])->assertStatus(200);

        $approveResp = $this->withHeaders([
            'X-User-Id' => $this->approverId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/approve", [
            'expected_version' => 2,
            'expected_material_version' => 1,
        ])->assertStatus(200);

        return $approveResp->json('data.result');
    }

    public function test_full_rf_lifecycle_gov05_self_approval_denial_and_formal_cancellation(): void
    {
        // 1. Create incomplete draft
        $draftKey = (string) Str::uuid();
        $draftResp = $this->withHeaders([
            'X-User-Id' => $this->requesterId,
            'X-Action-Key' => $draftKey,
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs", [
            'purpose' => 'internal_use',
            'requesting_unit_id' => $this->requestingUnitId,
            'event_id' => null,
            'needed_at' => null,
            'justification' => null,
            'lines' => [],
        ]);

        $draftResp->assertStatus(201)
            ->assertJsonPath('data.result.status', 'draft')
            ->assertJsonPath('data.result.reference', null)
            ->assertJsonPath('data.result.fulfillment', 'not_approved');

        $rfId = $draftResp->json('data.rf_id');

        // Incomplete submit rejected with 422
        $this->withHeaders([
            'X-User-Id' => $this->requesterId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/submit", [
            'expected_version' => 1,
            'expected_material_version' => 1,
        ])->assertStatus(422);

        // 2. Replace draft with complete line
        $replaceResp = $this->withHeaders([
            'X-User-Id' => $this->requesterId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->putJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'purpose' => 'internal_use',
            'requesting_unit_id' => $this->requestingUnitId,
            'event_id' => null,
            'needed_at' => '2026-11-25T08:00:00Z',
            'justification' => 'Training distribution',
            'lines' => [[
                'line_id' => null,
                'variant_id' => $this->variantId,
                'unit_id' => $this->unitId,
                'requested_quantity' => '10',
            ]],
        ]);
        $replaceResp->assertStatus(200)
            ->assertJsonPath('data.committed_version', 2)
            ->assertJsonPath('data.committed_material_version', 2);

        $lineId = $replaceResp->json('data.result.lines.0.id');

        // 3. Submit assigns once-only monotonic RF number
        $submitResp = $this->withHeaders([
            'X-User-Id' => $this->requesterId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/submit", [
            'expected_version' => 2,
            'expected_material_version' => 2,
        ]);
        $submitResp->assertStatus(200)
            ->assertJsonPath('data.result.status', 'submitted');

        $rfNumber = $submitResp->json('data.result.reference');
        $this->assertNotNull($rfNumber);

        // 4. GOV-05: Self-approval denied (403 independence_required)
        $this->withHeaders([
            'X-User-Id' => $this->requesterId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/approve", [
            'expected_version' => 3,
            'expected_material_version' => 2,
        ])->assertStatus(403)
            ->assertJsonPath('error.code', 'independence_required');

        // 5. Independent approver returns RF with reason
        $returnResp = $this->withHeaders([
            'X-User-Id' => $this->approverId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/return", [
            'expected_version' => 3,
            'expected_material_version' => 2,
            'reason' => 'Clarify justification',
        ]);
        $returnResp->assertStatus(200)
            ->assertJsonPath('data.result.status', 'returned')
            ->assertJsonPath('data.result.reference', $rfNumber);

        // 6. Revise returned RF retains line ID and RF number
        $reviseResp = $this->withHeaders([
            'X-User-Id' => $this->requesterId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/revise", [
            'expected_version' => 4,
            'expected_material_version' => 2,
            'expected_progress_version' => 1,
            'purpose' => 'internal_use',
            'requesting_unit_id' => $this->requestingUnitId,
            'event_id' => null,
            'needed_at' => '2026-11-25T08:00:00Z',
            'justification' => 'Updated workshop justification',
            'reason' => 'Added clearer justification',
            'lines' => [[
                'line_id' => $lineId,
                'variant_id' => $this->variantId,
                'unit_id' => $this->unitId,
                'requested_quantity' => '10',
            ]],
        ]);
        $reviseResp->assertStatus(200)
            ->assertJsonPath('data.result.reference', $rfNumber)
            ->assertJsonPath('data.result.lines.0.id', $lineId);

        // 7. Re-submit and approve independently
        $this->withHeaders([
            'X-User-Id' => $this->requesterId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/submit", [
            'expected_version' => 5,
            'expected_material_version' => 3,
        ])->assertStatus(200)
            ->assertJsonPath('data.result.reference', $rfNumber);

        $approveKey = (string) Str::uuid();
        $approveResp = $this->withHeaders([
            'X-User-Id' => $this->approverId,
            'X-Action-Key' => $approveKey,
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/approve", [
            'expected_version' => 6,
            'expected_material_version' => 3,
        ]);
        $approveResp->assertStatus(200)
            ->assertJsonPath('data.result.status', 'approved')
            ->assertJsonPath('data.result.fulfillment', 'outstanding')
            ->assertJsonPath('data.result.lines.0.progress.approved_quantity', '10');

        // Verify history, version read, related records, and operation recovery by key
        $this->withHeaders(['X-User-Id' => $this->requesterId])
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/history")
            ->assertStatus(200)
            ->assertJsonCount(7, 'data');

        $this->withHeaders(['X-User-Id' => $this->requesterId])
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/versions/7")
            ->assertStatus(200)
            ->assertJsonPath('data.snapshot.status', 'approved');

        $this->withHeaders(['X-User-Id' => $this->approverId])
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/operation-results?action_key={$approveKey}")
            ->assertStatus(200)
            ->assertJsonPath('data.result.status', 'approved');

        // Formal remainder cancellation
        $cancelResp = $this->withHeaders([
            'X-User-Id' => $this->requesterId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/cancel", [
            'expected_version' => 7,
            'expected_material_version' => 3,
            'expected_progress_version' => 1,
            'reason' => 'Event postponed indefinitely',
        ]);
        $cancelResp->assertStatus(200)
            ->assertJsonPath('data.result.status', 'canceled')
            ->assertJsonPath('data.result.fulfillment', 'closed_canceled')
            ->assertJsonPath('data.result.reference', $rfNumber)
            ->assertJsonPath('data.result.lines.0.progress.canceled_quantity', '10')
            ->assertJsonPath('data.result.lines.0.progress.remaining_quantity', '0');
    }

    public function test_fixture_b_exact_ten_vs_available_six_409_then_explicit_six_and_commitment_conflict_on_cancel(): void
    {
        $lot = $this->seedLot(6, 'LOT-SIX');
        $rf = $this->createAndApproveRf(10);
        $rfId = $rf['id'];
        $rfLineId = $rf['lines'][0]['id'];

        // Prepare exact 10 (preparation commits nothing)
        $prep10 = $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations", [
            'expected_rf_version' => $rf['version'],
            'expected_rf_material_version' => $rf['material_version'],
            'expected_rf_progress_version' => $rf['progress_version'],
            'rf_line_id' => $rfLineId,
            'targets' => [[
                'stock_lot_id' => $lot->id,
                'basis_segment_id' => $lot->basis_segment_id,
                'offset_quantity' => '0',
                'quantity' => '10',
                'expected_lot_material_version' => $lot->material_version,
                'expected_stock_version' => $lot->stock_version,
            ]],
            'override_policy_id' => null,
            'reason' => 'Attempt full 10 reservation',
        ])->assertStatus(201);

        $this->assertSame(0, StockReservation::count());
        $prep10Id = $prep10->json('data.resource_id');

        // Commit exact 10 -> 409 availability_conflict with failed_intent_committed = false
        $commit10 = $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations/{$prep10Id}/commit", [
            'expected_preparation_version' => 1,
            'expected_rf_version' => $rf['version'],
            'expected_rf_material_version' => $rf['material_version'],
            'expected_rf_progress_version' => $rf['progress_version'],
        ]);

        $commit10->assertStatus(409)
            ->assertJsonPath('error.code', 'availability_conflict')
            ->assertJsonPath('failed_intent_committed', false);
        $this->assertSame(0, StockReservation::count());

        // Prepare & commit explicit 6 -> succeeds and leaves 4 unreserved
        $prep6 = $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations", [
            'expected_rf_version' => $rf['version'],
            'expected_rf_material_version' => $rf['material_version'],
            'expected_rf_progress_version' => $rf['progress_version'],
            'rf_line_id' => $rfLineId,
            'targets' => [[
                'stock_lot_id' => $lot->id,
                'basis_segment_id' => $lot->basis_segment_id,
                'offset_quantity' => '0',
                'quantity' => '6',
                'expected_lot_material_version' => $lot->material_version,
                'expected_stock_version' => $lot->stock_version,
            ]],
            'override_policy_id' => null,
            'reason' => 'Explicit 6 after reviewing shortage',
        ])->assertStatus(201);

        $prep6Id = $prep6->json('data.resource_id');
        $commit6 = $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations/{$prep6Id}/commit", [
            'expected_preparation_version' => 1,
            'expected_rf_version' => $rf['version'],
            'expected_rf_material_version' => $rf['material_version'],
            'expected_rf_progress_version' => $rf['progress_version'],
        ]);

        $commit6->assertStatus(201)
            ->assertJsonPath('data.result.status', 'active')
            ->assertJsonPath('data.result.committed_quantity', '6')
            ->assertJsonPath('data.result.active_quantity', '6')
            ->assertJsonPath('data.result.demand.unreserved_quantity', '4');

        // Attempting to cancel RF while reservation is active returns 409 commitment_conflict
        $updatedRf = InternalRf::find($rfId);
        $this->withHeaders([
            'X-User-Id' => $this->requesterId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/cancel", [
            'expected_version' => $updatedRf->version,
            'expected_material_version' => $updatedRf->material_version,
            'expected_progress_version' => $updatedRf->progress_version,
            'reason' => 'Try cancel with active reservation',
        ])->assertStatus(409)
            ->assertJsonPath('error.code', 'commitment_conflict');
    }

    public function test_overlapping_holds_interval_union_and_sequential_clearance_and_reallocation(): void
    {
        $lotA = $this->seedLot(10, 'LOT-A');
        $lotB = $this->seedLot(10, 'LOT-B');
        $rf = $this->createAndApproveRf(10);
        $rfId = $rf['id'];
        $rfLineId = $rf['lines'][0]['id'];

        // Reserve 6 on Lot A [0, 6)
        $prep = $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations", [
            'expected_rf_version' => $rf['version'],
            'expected_rf_material_version' => $rf['material_version'],
            'expected_rf_progress_version' => $rf['progress_version'],
            'rf_line_id' => $rfLineId,
            'targets' => [[
                'stock_lot_id' => $lotA->id,
                'basis_segment_id' => $lotA->basis_segment_id,
                'offset_quantity' => '0',
                'quantity' => '6',
                'expected_lot_material_version' => $lotA->material_version,
                'expected_stock_version' => $lotA->stock_version,
            ]],
            'override_policy_id' => null,
            'reason' => 'Reserve 6 on Lot A',
        ])->assertStatus(201);

        $resResp = $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations/{$prep->json('data.resource_id')}/commit", [
            'expected_preparation_version' => 1,
            'expected_rf_version' => $rf['version'],
            'expected_rf_material_version' => $rf['material_version'],
            'expected_rf_progress_version' => $rf['progress_version'],
        ])->assertStatus(201);

        $reservationId = $resResp->json('data.resource_id');

        // Prepare an ActualIssue batch on reservation (will later be invalidated by reallocation!)
        $issuePrep = $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/actual-issues", [
            'expected_rf_version' => $resResp->json('data.result.rf_version'),
            'expected_rf_material_version' => $rf['material_version'],
            'expected_rf_progress_version' => $resResp->json('data.result.rf_progress_version'),
            'recipient_id' => $this->requesterId,
            'recipient_name' => 'Requester',
            'lines' => [[
                'rf_line_id' => $rfLineId,
                'reservation_id' => $reservationId,
                'expected_reservation_version' => 1,
                'expected_reservation_material_version' => 1,
                'targets' => [[
                    'stock_lot_id' => $lotA->id,
                    'basis_segment_id' => $lotA->basis_segment_id,
                    'offset_quantity' => '0',
                    'quantity' => '4',
                    'expected_lot_material_version' => $lotA->material_version,
                    'expected_stock_version' => $lotA->stock_version,
                ]],
            ]],
            'handed_over_at' => null,
            'acknowledged_at' => null,
            'recipient_accepts_partial' => true,
        ])->assertStatus(201);
        $preparedIssueId = $issuePrep->json('data.id');

        // Place Hold 1: [0, 4) -> blocked = 4
        $hold1Resp = $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds", [
            'targets' => [[
                'stock_lot_id' => $lotA->id,
                'basis_segment_id' => $lotA->basis_segment_id,
                'offset_quantity' => '0',
                'quantity' => '4',
                'expected_lot_material_version' => $lotA->material_version,
                'expected_stock_version' => $lotA->stock_version,
            ]],
            'reason_code' => 'damage_review',
            'reason' => 'First 4 units under review',
        ])->assertStatus(201);
        $hold1Id = $hold1Resp->json('data.resource_id');

        // Place Hold 2: [2, 6) -> overlaps [0,4)! Union [0,4) U [2,6) = [0,6) -> blocked = 6 (NOT 8!)
        $hold2Resp = $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds", [
            'targets' => [[
                'stock_lot_id' => $lotA->id,
                'basis_segment_id' => $lotA->basis_segment_id,
                'offset_quantity' => '2',
                'quantity' => '4',
                'expected_lot_material_version' => $lotA->material_version,
                'expected_stock_version' => $lotA->stock_version,
            ]],
            'reason_code' => 'safety_review',
            'reason' => 'Units 2..6 safety inspection',
        ])->assertStatus(201);
        $hold2Id = $hold2Resp->json('data.resource_id');

        $resRead = $this->withHeaders(['X-User-Id' => $this->custodianId])
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservations/{$reservationId}")
            ->assertStatus(200);
        $resRead->assertJsonPath('data.blocked_quantity', '6')
            ->assertJsonPath('data.status', 'blocked')
            ->assertJsonCount(2, 'data.active_hold_ids');

        // Verify non-additive stock views: total usable 20, RF reserved 6 (blocked 6), available = 20 - 6 = 14
        $views = app(StockViewQueryService::class)->getSevenViews($this->chapterId, $this->variantId);
        $this->assertSame('20', $views['usable_stockroom_on_hand']['quantity']);
        $this->assertSame('6', $views['rf_reserved']['quantity']);
        $this->assertSame('6', $views['blocked_reserved']['quantity']);
        $this->assertSame('14', $views['available_to_allocate']['quantity']);

        // Propose clearance for Hold 1
        $propResp = $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->putJson("/api/v1/chapters/{$this->chapterId}/stock-holds/{$hold1Id}/clearance-proposal", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'resolution' => 'Cleared after physical reinspection',
            'condition_treatment_source_id' => null,
            'signatories' => [['user_id' => $this->approverId, 'role' => 'CHAPTER_HEAD']],
        ])->assertStatus(200);

        $sha1 = $propResp->json('data.result.clearance_proposal.material_sha256');
        $hold1Model = StockHold::findOrFail($hold1Id);
        $ev1 = EvidenceRecord::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'evidence_type' => 'hold_clearance',
            'purpose' => 'hold_clearance',
            'record_id' => $hold1Id,
            'technical_state' => 'ready',
            'created_by' => $this->custodianId,
        ]);
        $blob1 = EvidenceBlob::create([
            'id' => (string) Str::uuid(),
            'evidence_id' => $ev1->id,
            'version' => 1,
            'sha256_hash' => str_repeat('a', 64),
            'mime_type' => 'application/pdf',
            'file_size' => 128,
            'payload_path' => 'evidence/test1.pdf',
            'created_by' => $this->custodianId,
        ]);
        $binding1 = app(CheckEvidenceBindingParticipant::class)->createOrUpdateBinding(
            $this->chapterId,
            $ev1->id,
            $blob1->id,
            'hold_clearance',
            $hold1Id,
            $this->custodianId,
            [['variant_id' => $lotA->id, 'unit_id' => $lotA->basis_segment_id, 'quantity' => '4']]
        );

        // Non-preparer denied (403 duty_denied)
        $this->withHeaders([
            'X-User-Id' => $this->otherCustodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds/{$hold1Id}/clear", [
            'expected_version' => 2,
            'expected_material_version' => 2,
            'expected_snapshot' => [
                'target' => ['purpose' => 'hold_clearance', 'record_id' => $hold1Id],
                'material_version' => 2,
                'sha256' => $sha1,
            ],
            'evidence' => [
                'evidence_id' => $ev1->id,
                'version_id' => $blob1->id,
                'attachments' => [['attachment_id' => $blob1->id, 'sha256' => str_repeat('a', 64)]],
            ],
            'matches_paper' => true,
        ])->assertStatus(403)
            ->assertJsonPath('error.code', 'duty_denied');

        $movementsBeforeClear = InventoryMovement::count();

        // Original preparer clears Hold 1 -> Hold 2 [2, 6) remains -> blocked drops from 6 to 4!
        $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds/{$hold1Id}/clear", [
            'expected_version' => 2,
            'expected_material_version' => 2,
            'expected_snapshot' => [
                'target' => ['purpose' => 'hold_clearance', 'record_id' => $hold1Id],
                'material_version' => 2,
                'sha256' => $sha1,
            ],
            'evidence' => [
                'evidence_id' => $ev1->id,
                'version_id' => $blob1->id,
                'binding_id' => $binding1->id,
                'attachments' => [['attachment_id' => $blob1->id, 'sha256' => str_repeat('a', 64)]],
            ],
            'matches_paper' => true,
        ])->assertStatus(200)
            ->assertJsonPath('data.result.status', 'cleared');

        // Zero physical movement on hold clearance
        $this->assertSame($movementsBeforeClear, InventoryMovement::count());

        $this->withHeaders(['X-User-Id' => $this->custodianId])
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservations/{$reservationId}")
            ->assertStatus(200)
            ->assertJsonPath('data.blocked_quantity', '4')
            ->assertJsonPath('data.status', 'partially_blocked');

        // Reallocate full 6 from Lot A (including held [2,6)) to Lot B -> retains reservation ID & invalidates prepared batch!
        $resNow = StockReservation::findOrFail($reservationId);
        $rfNow = InternalRf::findOrFail($rfId);

        $reallocResp = $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservations/{$reservationId}/reallocate", [
            'expected_version' => $resNow->version,
            'expected_material_version' => $resNow->material_version,
            'expected_rf_version' => $rfNow->version,
            'expected_rf_material_version' => $rfNow->material_version,
            'expected_rf_progress_version' => $rfNow->progress_version,
            'from_ranges' => [[
                'stock_lot_id' => $lotA->id,
                'basis_segment_id' => $lotA->basis_segment_id,
                'offset_quantity' => '0',
                'quantity' => '6',
            ]],
            'to_targets' => [[
                'stock_lot_id' => $lotB->id,
                'basis_segment_id' => $lotB->basis_segment_id,
                'offset_quantity' => '0',
                'quantity' => '6',
                'expected_lot_material_version' => $lotB->material_version,
                'expected_stock_version' => $lotB->stock_version,
            ]],
            'override_policy_id' => null,
            'reason' => 'Move away from held Lot A to clean Lot B',
        ]);

        $reallocResp->assertStatus(200)
            ->assertJsonPath('data.result.id', $reservationId)
            ->assertJsonPath('data.result.status', 'active')
            ->assertJsonPath('data.result.blocked_quantity', '0')
            ->assertJsonPath('data.result.allocations.0.stock_lot_id', $lotB->id);

        // Prepared issue batch referencing Lot A was invalidated
        $this->assertDatabaseHas('actual_issues', [
            'id' => $preparedIssueId,
            'status' => 'invalidated',
        ]);
    }

    public function test_conc01_last_unit_competition_prevents_double_allocation(): void
    {
        $lot = $this->seedLot(5, 'LOT-CONC01');
        $rf1 = $this->createAndApproveRf(5);
        $rf2 = $this->createAndApproveRf(5);

        // Both RFs prepare against the same [0, 5) segment before either commits
        $p1 = $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf1['id']}/reservation-preparations", [
            'expected_rf_version' => $rf1['version'],
            'expected_rf_material_version' => $rf1['material_version'],
            'expected_rf_progress_version' => $rf1['progress_version'],
            'rf_line_id' => $rf1['lines'][0]['id'],
            'targets' => [[
                'stock_lot_id' => $lot->id,
                'basis_segment_id' => $lot->basis_segment_id,
                'offset_quantity' => '0',
                'quantity' => '5',
                'expected_lot_material_version' => $lot->material_version,
                'expected_stock_version' => $lot->stock_version,
            ]],
            'override_policy_id' => null,
            'reason' => 'RF1 prep',
        ])->assertStatus(201);

        $p2 = $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf2['id']}/reservation-preparations", [
            'expected_rf_version' => $rf2['version'],
            'expected_rf_material_version' => $rf2['material_version'],
            'expected_rf_progress_version' => $rf2['progress_version'],
            'rf_line_id' => $rf2['lines'][0]['id'],
            'targets' => [[
                'stock_lot_id' => $lot->id,
                'basis_segment_id' => $lot->basis_segment_id,
                'offset_quantity' => '0',
                'quantity' => '5',
                'expected_lot_material_version' => $lot->material_version,
                'expected_stock_version' => $lot->stock_version,
            ]],
            'override_policy_id' => null,
            'reason' => 'RF2 prep',
        ])->assertStatus(201);

        // First commit wins
        $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf1['id']}/reservation-preparations/{$p1->json('data.resource_id')}/commit", [
            'expected_preparation_version' => 1,
            'expected_rf_version' => $rf1['version'],
            'expected_rf_material_version' => $rf1['material_version'],
            'expected_rf_progress_version' => $rf1['progress_version'],
        ])->assertStatus(201);

        // Second commit MUST fail 409 availability_conflict with zero double-allocation
        $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf2['id']}/reservation-preparations/{$p2->json('data.resource_id')}/commit", [
            'expected_preparation_version' => 1,
            'expected_rf_version' => $rf2['version'],
            'expected_rf_material_version' => $rf2['material_version'],
            'expected_rf_progress_version' => $rf2['progress_version'],
        ])->assertStatus(409)
            ->assertJsonPath('error.code', 'availability_conflict')
            ->assertJsonPath('failed_intent_committed', false);

        $this->assertSame(1, StockReservation::where('chapter_id', $this->chapterId)->where('status', 'ACTIVE')->count());
    }

    public function test_intra_request_overlapping_targets_rejected_with_422_for_reservation_and_hold(): void
    {
        $lot = $this->seedLot(10, 'LOT-DISJOINT');
        $rf = $this->createAndApproveRf(10);

        // Overlapping targets inside prepareRfReservation -> 422 invalid_input
        $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf['id']}/reservation-preparations", [
            'expected_rf_version' => $rf['version'],
            'expected_rf_material_version' => $rf['material_version'],
            'expected_rf_progress_version' => $rf['progress_version'],
            'rf_line_id' => $rf['lines'][0]['id'],
            'targets' => [
                [
                    'stock_lot_id' => $lot->id,
                    'basis_segment_id' => $lot->basis_segment_id,
                    'offset_quantity' => '0',
                    'quantity' => '4',
                    'expected_lot_material_version' => $lot->material_version,
                    'expected_stock_version' => $lot->stock_version,
                ],
                [
                    'stock_lot_id' => $lot->id,
                    'basis_segment_id' => $lot->basis_segment_id,
                    'offset_quantity' => '2',
                    'quantity' => '3',
                    'expected_lot_material_version' => $lot->material_version,
                    'expected_stock_version' => $lot->stock_version,
                ],
            ],
            'override_policy_id' => null,
            'reason' => 'Overlapping reservation targets',
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'invalid_input');

        // Overlapping targets inside placeStockHold -> 422 invalid_input
        $this->withHeaders([
            'X-User-Id' => $this->custodianId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds", [
            'targets' => [
                [
                    'stock_lot_id' => $lot->id,
                    'basis_segment_id' => $lot->basis_segment_id,
                    'offset_quantity' => '0',
                    'quantity' => '4',
                    'expected_lot_material_version' => $lot->material_version,
                    'expected_stock_version' => $lot->stock_version,
                ],
                [
                    'stock_lot_id' => $lot->id,
                    'basis_segment_id' => $lot->basis_segment_id,
                    'offset_quantity' => '3',
                    'quantity' => '3',
                    'expected_lot_material_version' => $lot->material_version,
                    'expected_stock_version' => $lot->stock_version,
                ],
            ],
            'reason_code' => 'damage_review',
            'reason' => 'Overlapping hold targets',
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'invalid_input');
    }
}
