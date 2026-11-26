<?php

namespace Tests\Feature\Stage1B;

use App\Models\ActualIssue;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DomainNotificationOutbox;
use App\Models\DutyGrant;
use App\Models\EvidenceBinding;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use App\Models\Handover;
use App\Models\IdempotencyRecord;
use App\Models\InternalRf;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\StockReservation;
use App\Models\User;
use App\Services\Inventory\Participants\PrepareActualIssueInventoryParticipant;
use App\Services\Inventory\PhysicalPostingService;
use App\Services\Inventory\StockViewQueryService;
use Exception;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\TestCase;

class ActualIssueTest extends TestCase
{
    use AuthenticatesBrowserOfficer;
    use RefreshDatabase;

    private string $chapterId;

    private string $foreignChapterId;

    private string $requesterId;

    private string $approverId;

    private string $approverGrantId;

    private string $requestingUnitId;

    private string $custodianId;

    private string $otherCustodianId;

    private string $headUserId;

    private string $financeUserId;

    private string $unitId;

    private string $itemId;

    private string $variantId;

    private string $locationId;

    private string $custodianGrantId;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('evidence');

        $this->chapterId = (string) Str::uuid();
        $this->foreignChapterId = (string) Str::uuid();
        $this->requesterId = (string) Str::uuid();
        $this->approverId = (string) Str::uuid();
        $this->requestingUnitId = (string) Str::uuid();
        $this->custodianId = (string) Str::uuid();
        $this->otherCustodianId = (string) Str::uuid();
        $this->headUserId = (string) Str::uuid();
        $this->financeUserId = (string) Str::uuid();

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
            $this->requesterId => ['req@example.invalid', 'Requester', ['COMMITTEE_REQUESTER']],
            $this->approverId => ['app@example.invalid', 'Approver', ['RF_APPROVER']],
            $this->custodianId => ['cust@example.invalid', 'Custodian', ['INVENTORY_CUSTODIAN', 'INVENTORY', 'DISPATCH']],
            $this->otherCustodianId => ['cust2@example.invalid', 'Other Custodian', ['INVENTORY_CUSTODIAN', 'INVENTORY', 'DISPATCH']],
            $this->headUserId => ['head@example.invalid', 'Chapter Head', ['CHAPTER_HEAD']],
            $this->financeUserId => ['fin@example.invalid', 'Finance', ['FINANCE']],
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
                $grant = DutyGrant::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $this->chapterId,
                    'user_id' => $uid,
                    'duty_code' => $duty,
                    'status' => 'active',
                    'valid_from' => now()->subDay(),
                    'version' => 1,
                ]);
                if ($uid === $this->custodianId && $duty === 'INVENTORY_CUSTODIAN') {
                    $this->custodianGrantId = $grant->id;
                }
                if ($uid === $this->approverId && $duty === 'RF_APPROVER') {
                    $this->approverGrantId = $grant->id;
                }
            }
        }

        $this->seedEffectiveStage1Policies(
            $this->chapterId,
            $this->headUserId,
            $this->financeUserId,
            $this->requestingUnitId,
            $this->approverGrantId,
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
            'code' => 'ITEM-MED',
            'name' => 'Medical Pack',
            'unit_id' => $this->unitId,
            'state' => 'active',
            'material_version' => 1,
        ]);

        $this->variantId = (string) Str::uuid();
        CatalogueVariant::create([
            'id' => $this->variantId,
            'chapter_id' => $this->chapterId,
            'item_id' => $this->itemId,
            'sku' => 'VAR-MED-01',
            'name' => 'Medical Pack Std',
            'label' => 'Medical Pack Std',
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

    private function postOpeningBaseline15To12Usable(): InventoryLot
    {
        app(PhysicalPostingService::class)->createPosting(
            $this->chapterId,
            'IPC',
            (string) Str::uuid(),
            $this->custodianId,
            [
                [
                    'variant_id' => $this->variantId,
                    'unit_id' => $this->unitId,
                    'location_id' => $this->locationId,
                    'condition' => 'USABLE',
                    'custody' => 'STOCKROOM',
                    'lot_code' => 'OPEN-USABLE-12',
                    'quantity' => 12,
                    'quantity_scale' => 0,
                ],
                [
                    'variant_id' => $this->variantId,
                    'unit_id' => $this->unitId,
                    'location_id' => $this->locationId,
                    'condition' => 'QUARANTINE',
                    'custody' => 'STOCKROOM',
                    'lot_code' => 'OPEN-QUAR-2',
                    'quantity' => 2,
                    'quantity_scale' => 0,
                ],
                [
                    'variant_id' => $this->variantId,
                    'unit_id' => $this->unitId,
                    'location_id' => $this->locationId,
                    'condition' => 'REJECTED',
                    'custody' => 'STOCKROOM',
                    'lot_code' => 'OPEN-REJ-1',
                    'quantity' => 1,
                    'quantity_scale' => 0,
                ],
            ]
        );

        return InventoryLot::where('chapter_id', $this->chapterId)
            ->where('condition', 'USABLE')
            ->firstOrFail();
    }

    private function createApprovedRf10(): array
    {
        $rf = $this->asBrowserOfficer($this->requesterId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs", [
                'purpose' => 'internal_use',
                'requesting_unit_id' => $this->requestingUnitId,
                'event_id' => null,
                'needed_at' => '2026-11-25T09:00:00Z',
                'justification' => 'Fixture A medical outreach',
                'lines' => [[
                    'line_id' => null,
                    'variant_id' => $this->variantId,
                    'unit_id' => $this->unitId,
                    'requested_quantity' => '10',
                ]],
            ])->assertStatus(201)->json('data.result');

        $this->asBrowserOfficer($this->requesterId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf['id']}/submit", [
                'expected_version' => 1,
                'expected_material_version' => 1,
            ])->assertStatus(200);

        return $this->asBrowserOfficer($this->approverId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf['id']}/approve", [
                'expected_version' => 2,
                'expected_material_version' => 1,
            ])->assertStatus(200)->json('data.result');
    }

    private function reserveQty(string $rfId, string $rfLineId, InventoryLot $lot, string $offset, string $qty): array
    {
        $rf = InternalRf::findOrFail($rfId);
        $prep = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations", [
            'expected_rf_version' => $rf->version,
            'expected_rf_material_version' => $rf->material_version,
            'expected_rf_progress_version' => $rf->progress_version,
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
        ])->assertStatus(201);

        return $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations/{$prep->json('data.resource_id')}/commit", [
            'expected_preparation_version' => 1,
            'expected_rf_version' => $rf->version,
            'expected_rf_material_version' => $rf->material_version,
            'expected_rf_progress_version' => $rf->progress_version,
        ])->assertStatus(201)->json('data.result');
    }

    /** @return array{0: EvidenceRecord, 1: EvidenceBlob, 2: array<string, mixed>} */
    private function createEvidenceForIssue(string $issueId): array
    {
        return $this->storeReadyPaperEvidence(
            $this->chapterId,
            $this->custodianId,
            'actual_issue',
            $issueId,
            "Actual Issue {$issueId}",
        );
    }

    private function prepareMatchAndPost(
        string $rfId,
        string $rfLineId,
        array $reservation,
        InventoryLot $lot,
        string $offset,
        string $qty,
        string $postActionKey
    ): array {
        $rf = InternalRf::findOrFail($rfId);
        $lot->refresh();
        $handedOverAt = now('UTC')->subMinutes(2)->format('Y-m-d\TH:i:s.u\Z');
        $acknowledgedAt = now('UTC')->subMinute()->format('Y-m-d\TH:i:s.u\Z');

        $prepResp = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/actual-issues", [
            'expected_rf_version' => $rf->version,
            'expected_rf_material_version' => $rf->material_version,
            'expected_rf_progress_version' => $rf->progress_version,
            'recipient_id' => $this->requesterId,
            'recipient_name' => 'Requester Team',
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
            'handed_over_at' => $handedOverAt,
            'acknowledged_at' => $acknowledgedAt,
            'recipient_accepts_partial' => true,
        ])->assertStatus(201);

        $issue = $prepResp->json('data');

        // Print-only check causes zero stock movement
        $movBeforePrint = InventoryMovement::count();
        $this->asBrowserOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issue['id']}/print")
            ->assertStatus(200)
            ->assertJsonPath('data.status_watermark', 'PREPARED');
        $this->assertSame($movBeforePrint, InventoryMovement::count());

        [, , $byteBinding] = $this->createEvidenceForIssue($issue['id']);

        $matchResp = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issue['id']}/acknowledgments", [
            'expected_version' => $issue['version'],
            'expected_material_version' => $issue['material_version'],
            'expected_snapshot' => $issue['snapshot'],
            'evidence' => $byteBinding,
            'matches_paper' => true,
        ])->assertStatus(200)
            ->assertJsonPath('data.result.status', 'acknowledged')
            ->assertJsonPath('data.result.handover_fence', 'unresolved');

        $matchedIssue = $matchResp->json('data.result');
        $acknowledgmentId = $matchedIssue['acknowledgment']['acknowledgment_id'];

        $postResp = $this->asBrowserOfficer($this->custodianId, $postActionKey)->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issue['id']}/post", [
            'expected_version' => $matchedIssue['version'],
            'expected_material_version' => $matchedIssue['material_version'],
            'expected_rf_version' => $rf->version,
            'expected_rf_material_version' => $rf->material_version,
            'expected_rf_progress_version' => $rf->progress_version,
            'acknowledgment_id' => $acknowledgmentId,
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
        ])->assertStatus(200)
            ->assertJsonPath('outcome', 'committed')
            ->assertJsonPath('status', 'posted');

        return [
            'issue' => $issue,
            'post' => $postResp->json(),
        ];
    }

    public function test_fixture_a_full_journey_opening_15_to_12_rf_10_three_partial_issues_and_by_key_recovery(): void
    {
        $lot = $this->postOpeningBaseline15To12Usable();
        $rf = $this->createApprovedRf10();
        $rfId = $rf['id'];
        $rfLineId = $rf['lines'][0]['id'];

        // Reserve 6 -> [0, 6)
        $res1 = $this->reserveQty($rfId, $rfLineId, $lot, '0', '6');

        // Batch 1: Partial 4 -> [0, 4)
        $key1 = (string) Str::uuid();
        $b1 = $this->prepareMatchAndPost($rfId, $rfLineId, $res1, $lot, '0', '4', $key1);
        $this->assertStringEndsWith('000001', $b1['issue']['reference']);

        $views1 = app(StockViewQueryService::class)->getSevenViews($this->chapterId, $this->variantId);
        $this->assertSame('8', $views1['usable_stockroom_on_hand']['quantity']);
        $this->assertSame('2', $views1['rf_reserved']['quantity']);
        $this->assertSame('6', $views1['available_to_allocate']['quantity']);

        // Batch 2: Partial 2 -> [4, 6) from remaining res1
        $res1Updated = $this->asBrowserOfficer($this->custodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservations/{$res1['id']}")
            ->assertStatus(200)->json('data');

        $key2 = (string) Str::uuid();
        $b2 = $this->prepareMatchAndPost($rfId, $rfLineId, $res1Updated, $lot, '4', '2', $key2);
        $this->assertStringEndsWith('000002', $b2['issue']['reference']);

        $lot->refresh();
        // Reserve remaining 4 at exact Fixture A basis coordinates [6, 10)
        $res2 = $this->reserveQty($rfId, $rfLineId, $lot, '6', '4');

        // Batch 3: Partial 4 -> [6, 10)
        $key3 = (string) Str::uuid();
        $b3 = $this->prepareMatchAndPost($rfId, $rfLineId, $res2, $lot, '6', '4', $key3);
        $this->assertStringEndsWith('000003', $b3['issue']['reference']);

        $views3 = app(StockViewQueryService::class)->getSevenViews($this->chapterId, $this->variantId);
        $this->assertSame('2', $views3['usable_stockroom_on_hand']['quantity']);
        $this->assertSame('0', $views3['rf_reserved']['quantity']);
        $this->assertSame('2', $views3['available_to_allocate']['quantity']);

        $finalRf = $this->asBrowserOfficer($this->requesterId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}")
            ->assertStatus(200)->json('data');
        $this->assertSame('fulfilled', $finalRf['fulfillment']);
        $this->assertSame('10', $finalRf['lines'][0]['progress']['issued_quantity']);
        $this->assertSame('0', $finalRf['lines'][0]['progress']['remaining_quantity']);

        // Verify movements, history, related
        $issue3Id = $b3['issue']['id'];
        $this->asBrowserOfficer($this->custodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issue3Id}/movements")
            ->assertStatus(200)
            ->assertJsonCount(1, 'data');

        $this->asBrowserOfficer($this->custodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issue3Id}/history")
            ->assertStatus(200)
            ->assertJsonCount(3, 'data');

        $this->asBrowserOfficer($this->custodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issue3Id}/related")
            ->assertStatus(200)
            ->assertJsonPath('data.rf.id', $rfId)
            ->assertJsonCount(1, 'data.movements');

        // Verify uncertain-outcome recovery via both action_key and key, and actor scoping
        $this->asBrowserOfficer($this->custodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/actual-issue-operations/by-key?action_key={$key3}")
            ->assertStatus(200)
            ->assertHeader('X-Action-Replayed', 'true')
            ->assertJsonPath('actual_issue_id', $issue3Id);

        $this->asBrowserOfficer($this->custodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/actual-issue-operations/by-key?key={$key3}")
            ->assertStatus(200)
            ->assertJsonPath('actual_issue_id', $issue3Id);

        // Different actor cannot recover another actor's operation key
        $this->asBrowserOfficer($this->otherCustodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/actual-issue-operations/by-key?action_key={$key3}")
            ->assertStatus(404);
    }

    public function test_revise_invalidates_prior_evidence_binding_and_blocks_stale_post(): void
    {
        $lot = $this->postOpeningBaseline15To12Usable();
        $rf = $this->createApprovedRf10();
        $res = $this->reserveQty($rf['id'], $rf['lines'][0]['id'], $lot, '0', '6');

        $handedOverAt = now('UTC')->subMinutes(2)->format('Y-m-d\TH:i:s.u\Z');
        $acknowledgedAt = now('UTC')->subMinute()->format('Y-m-d\TH:i:s.u\Z');
        $prep = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf['id']}/actual-issues", [
            'expected_rf_version' => InternalRf::find($rf['id'])->version,
            'expected_rf_material_version' => $rf['material_version'],
            'expected_rf_progress_version' => InternalRf::find($rf['id'])->progress_version,
            'recipient_id' => $this->requesterId,
            'recipient_name' => 'Requester Team',
            'lines' => [[
                'rf_line_id' => $rf['lines'][0]['id'],
                'reservation_id' => $res['id'],
                'expected_reservation_version' => 1,
                'expected_reservation_material_version' => 1,
                'targets' => [[
                    'stock_lot_id' => $lot->id,
                    'basis_segment_id' => $lot->basis_segment_id,
                    'offset_quantity' => '0',
                    'quantity' => '4',
                    'expected_lot_material_version' => $lot->material_version,
                    'expected_stock_version' => $lot->stock_version,
                ]],
            ]],
            'handed_over_at' => $handedOverAt,
            'acknowledged_at' => $acknowledgedAt,
            'recipient_accepts_partial' => true,
        ])->assertStatus(201)->json('data');

        [, , $byteBinding] = $this->createEvidenceForIssue($prep['id']);

        // Match first -> sets status=acknowledged, handover_fence=unresolved
        $matched = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$prep['id']}/acknowledgments", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'expected_snapshot' => $prep['snapshot'],
            'evidence' => $byteBinding,
            'matches_paper' => true,
        ])->assertStatus(200)->json('data.result');
        $ackId = $matched['acknowledgment']['acknowledgment_id'];

        // Reconcile no_handover to clear unresolved fence so batch can be revised
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$prep['id']}/reconciliations", [
            'expected_version' => $matched['version'],
            'finding' => 'no_handover',
            'notes' => 'Batch needs revision before handover',
        ])->assertStatus(201);

        // Revise batch -> must atomically invalidate old EvidenceBinding
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->putJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$prep['id']}", [
            'expected_version' => 3,
            'expected_material_version' => 1,
            'recipient_name' => 'Requester Team Revised',
            'reason' => 'Updated quantity to 3',
        ])->assertStatus(200)
            ->assertJsonPath('data.material_version', 2)
            ->assertJsonPath('data.acknowledgment', null);

        $this->assertDatabaseHas('evidence_bindings', [
            'id' => $ackId,
            'status' => 'invalidated',
        ]);

        // Posting with invalidated acknowledgment fails 409 evidence_mismatch
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$prep['id']}/post", [
            'expected_version' => 4,
            'expected_material_version' => 2,
            'acknowledgment_id' => $ackId,
        ])->assertStatus(409)
            ->assertJsonPath('error.code', 'evidence_mismatch');
    }

    public function test_atomicity_fault_injection_leaves_zero_movements_consumption_and_outbox(): void
    {
        $lot = $this->postOpeningBaseline15To12Usable();
        $rf = $this->createApprovedRf10();
        $res = $this->reserveQty($rf['id'], $rf['lines'][0]['id'], $lot, '0', '4');

        $handedOverAt = now('UTC')->subMinutes(2)->format('Y-m-d\TH:i:s.u\Z');
        $acknowledgedAt = now('UTC')->subMinute()->format('Y-m-d\TH:i:s.u\Z');
        $prep = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf['id']}/actual-issues", [
            'expected_rf_version' => InternalRf::find($rf['id'])->version,
            'expected_rf_material_version' => $rf['material_version'],
            'expected_rf_progress_version' => InternalRf::find($rf['id'])->progress_version,
            'recipient_id' => $this->requesterId,
            'recipient_name' => 'Requester Team',
            'lines' => [[
                'rf_line_id' => $rf['lines'][0]['id'],
                'reservation_id' => $res['id'],
                'expected_reservation_version' => 1,
                'expected_reservation_material_version' => 1,
                'targets' => [[
                    'stock_lot_id' => $lot->id,
                    'basis_segment_id' => $lot->basis_segment_id,
                    'offset_quantity' => '0',
                    'quantity' => '4',
                    'expected_lot_material_version' => $lot->material_version,
                    'expected_stock_version' => $lot->stock_version,
                ]],
            ]],
            'handed_over_at' => $handedOverAt,
            'acknowledged_at' => $acknowledgedAt,
            'recipient_accepts_partial' => true,
        ])->assertStatus(201)->json('data');

        [, , $byteBinding] = $this->createEvidenceForIssue($prep['id']);
        $matched = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$prep['id']}/acknowledgments", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'expected_snapshot' => $prep['snapshot'],
            'evidence' => $byteBinding,
            'matches_paper' => true,
        ])->assertStatus(200)->json('data.result');
        $ackId = $matched['acknowledgment']['acknowledgment_id'];

        $movCountBefore = InventoryMovement::count();
        $outboxCountBefore = DomainNotificationOutbox::count();
        $handoverCountBefore = Handover::count();

        // Inject fault inside inventory participant AFTER demand consumption has run in the same DB transaction
        $stubInv = $this->createStub(PrepareActualIssueInventoryParticipant::class);
        $stubInv->method('execute')->willThrowException(new Exception('Simulated DB/inventory failure'));
        $this->app->instance(PrepareActualIssueInventoryParticipant::class, $stubInv);

        try {
            $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$prep['id']}/post", [
                'expected_version' => 2,
                'expected_material_version' => 1,
                'acknowledgment_id' => $ackId,
            ]);
        } catch (Exception) {
            // Expected rollback
        }

        // Everything must have rolled back cleanly
        $this->assertSame($movCountBefore, InventoryMovement::count());
        $this->assertSame($outboxCountBefore, DomainNotificationOutbox::count());
        $this->assertSame($handoverCountBefore, Handover::count());
        $this->assertEquals(4.0, (float) StockReservation::findOrFail($res['id'])->active_quantity);
        $this->assertEquals(0.0, (float) InternalRf::findOrFail($rf['id'])->lines()->first()->issued_quantity);
    }

    public function test_hold_first_vs_issue_first_and_conc06_and_all_reconciliations_and_duty_revocation(): void
    {
        $lot = $this->postOpeningBaseline15To12Usable();
        $rf = $this->createApprovedRf10();
        $res = $this->reserveQty($rf['id'], $rf['lines'][0]['id'], $lot, '0', '4');

        // Prepare two competing batches on the same 4 reserved units (CONC-06)
        $rfModel = InternalRf::findOrFail($rf['id']);
        $makeBatch = function () use ($rfModel, $rf, $res, $lot): array {
            $handedOverAt = now('UTC')->subMinutes(2)->format('Y-m-d\TH:i:s.u\Z');
            $acknowledgedAt = now('UTC')->subMinute()->format('Y-m-d\TH:i:s.u\Z');
            $p = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf['id']}/actual-issues", [
                'expected_rf_version' => $rfModel->version,
                'expected_rf_material_version' => $rfModel->material_version,
                'expected_rf_progress_version' => $rfModel->progress_version,
                'recipient_id' => $this->requesterId,
                'recipient_name' => 'Requester Team',
                'lines' => [[
                    'rf_line_id' => $rf['lines'][0]['id'],
                    'reservation_id' => $res['id'],
                    'expected_reservation_version' => 1,
                    'expected_reservation_material_version' => 1,
                    'targets' => [[
                        'stock_lot_id' => $lot->id,
                        'basis_segment_id' => $lot->basis_segment_id,
                        'offset_quantity' => '0',
                        'quantity' => '4',
                        'expected_lot_material_version' => $lot->material_version,
                        'expected_stock_version' => $lot->stock_version,
                    ]],
                ]],
                'handed_over_at' => $handedOverAt,
                'acknowledged_at' => $acknowledgedAt,
                'recipient_accepts_partial' => true,
            ])->assertStatus(201)->json('data');

            [, , $byteBinding] = $this->createEvidenceForIssue($p['id']);
            $matched = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$p['id']}/acknowledgments", [
                'expected_version' => 1,
                'expected_material_version' => 1,
                'expected_snapshot' => $p['snapshot'],
                'evidence' => $byteBinding,
                'matches_paper' => true,
            ])->assertStatus(200)->json('data.result');

            $binding = EvidenceBinding::findOrFail($matched['acknowledgment']['acknowledgment_id']);

            return ['issue' => $p, 'binding' => $binding, 'byteBinding' => $byteBinding];
        };

        $batchA = $makeBatch();
        $batchB = $makeBatch();

        // False 'committed' reconciliation on unposted issue rejected (409 handover_unresolved)
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$batchA['issue']['id']}/reconciliations", [
            'expected_version' => 2,
            'finding' => 'committed',
            'notes' => 'Premature committed claim',
        ])->assertStatus(409)
            ->assertJsonPath('error.code', 'handover_unresolved');

        // Hold-First (CONC-02): Place hold after match -> post fails 409 stock_held!
        $holdResp = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds", [
            'targets' => [[
                'stock_lot_id' => $lot->id,
                'basis_segment_id' => $lot->basis_segment_id,
                'offset_quantity' => '0',
                'quantity' => '4',
                'expected_lot_material_version' => $lot->material_version,
                'expected_stock_version' => $lot->stock_version,
            ]],
            'reason_code' => 'damage_review',
            'reason' => 'Hold placed after match',
        ])->assertStatus(201);
        $holdId = $holdResp->json('data.resource_id');

        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$batchA['issue']['id']}/post", [
            'expected_version' => 2,
            'expected_material_version' => 1,
            'acknowledgment_id' => $batchA['binding']->id,
        ])->assertStatus(409)
            ->assertJsonPath('error.code', 'stock_held')
            ->assertJsonPath('failed_intent_committed', false);

        // Clear the hold so Batch A can post
        $propResp = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->putJson("/api/v1/chapters/{$this->chapterId}/stock-holds/{$holdId}/clearance-proposal", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'resolution' => 'Cleared',
            'condition_treatment_source_id' => null,
            'signatories' => [[
                'user_id' => $this->headUserId,
                'role' => 'CHAPTER_HEAD',
                'signed_at' => now('UTC')->subMinute()->format('Y-m-d\TH:i:s.u\Z'),
            ]],
        ])->assertStatus(200);
        [, , $byteClear] = $this->storeReadyPaperEvidence(
            $this->chapterId,
            $this->custodianId,
            'hold_clearance',
            $holdId,
            'Clear Hold',
        );
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds/{$holdId}/clear", [
            'expected_version' => 2,
            'expected_material_version' => 2,
            'expected_snapshot' => [
                'target' => ['purpose' => 'hold_clearance', 'record_id' => $holdId],
                'material_version' => 2,
                'sha256' => $propResp->json('data.result.clearance_proposal.material_sha256'),
            ],
            'evidence' => $byteClear,
            'matches_paper' => true,
        ])->assertStatus(200);

        // Batch A posts!
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$batchA['issue']['id']}/post", [
            'expected_version' => 2,
            'expected_material_version' => 1,
            'acknowledgment_id' => $batchA['binding']->id,
        ])->assertStatus(200)
            ->assertJsonPath('outcome', 'committed');

        // CONC-06: Batch B fails 409 reservation_conflict
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$batchB['issue']['id']}/post", [
            'expected_version' => 2,
            'expected_material_version' => 1,
            'acknowledgment_id' => $batchB['binding']->id,
        ])->assertStatus(409)
            ->assertJsonPath('error.code', 'reservation_conflict');

        // Issue-First (CONC-05): Place hold on already-consumed basis coordinates [0, 4) -> 409 already_consumed
        $lot->refresh();
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds", [
            'targets' => [[
                'stock_lot_id' => $lot->id,
                'basis_segment_id' => $lot->basis_segment_id,
                'offset_quantity' => '0',
                'quantity' => '4',
                'expected_lot_material_version' => $lot->material_version,
                'expected_stock_version' => $lot->stock_version,
            ]],
            'reason_code' => 'damage_review',
            'reason' => 'Late hold on consumed [0,4) units',
        ])->assertStatus(409)
            ->assertJsonPath('error.code', 'already_consumed');

        // Placing hold on unconsumed basis coordinates [4, 8) within [0, 12) succeeds
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds", [
            'targets' => [[
                'stock_lot_id' => $lot->id,
                'basis_segment_id' => $lot->basis_segment_id,
                'offset_quantity' => '4',
                'quantity' => '4',
                'expected_lot_material_version' => $lot->material_version,
                'expected_stock_version' => $lot->stock_version,
            ]],
            'reason_code' => 'damage_review',
            'reason' => 'Hold on remaining unconsumed [4,8)',
        ])->assertStatus(201);

        // Remaining reconciliation findings: committed (on posted A), handed_over_unposted, no_handover & disputed (on unposted B)
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$batchA['issue']['id']}/reconciliations", [
            'finding' => 'committed',
            'notes' => 'Confirmed posted',
        ])->assertStatus(201);

        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$batchB['issue']['id']}/reconciliations", [
            'finding' => 'handed_over_unposted',
            'notes' => 'Paper handed over before crash',
        ])->assertStatus(201)
            ->assertJsonPath('issue.handover_fence', 'retry_authorized');

        // no_handover invalidates match & resets handover_fence to 'none'
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$batchB['issue']['id']}/reconciliations", [
            'finding' => 'no_handover',
            'notes' => 'Confirmed no physical handover occurred',
        ])->assertStatus(201)
            ->assertJsonPath('issue.handover_fence', 'none')
            ->assertJsonPath('issue.status', 'prepared')
            ->assertJsonPath('issue.acknowledgment', null);

        // disputed sets fence='disputed' and blocks both matching and posting
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$batchB['issue']['id']}/reconciliations", [
            'finding' => 'disputed',
            'notes' => 'Quantity discrepancy under investigation',
        ])->assertStatus(201)
            ->assertJsonPath('issue.handover_fence', 'disputed');

        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$batchB['issue']['id']}/acknowledgments", [
            'expected_version' => 5,
            'expected_material_version' => 1,
            'expected_snapshot' => $batchB['issue']['snapshot'],
            'evidence' => $batchB['byteBinding'],
            'matches_paper' => true,
        ])->assertStatus(409)
            ->assertJsonPath('error.code', 'handover_unresolved');

        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$batchB['issue']['id']}/post", [
            'expected_version' => 5,
            'expected_material_version' => 1,
            'acknowledgment_id' => $batchB['binding']->id,
        ])->assertStatus(409)
            ->assertJsonPath('error.code', 'handover_unresolved');

        // In-flight operation recovery returns 409 OPERATION_IN_FLIGHT
        $inFlightKey = (string) Str::uuid();
        IdempotencyRecord::create([
            'id' => (string) Str::uuid(),
            'key' => $inFlightKey,
            'chapter_id' => $this->chapterId,
            'user_id' => $this->custodianId,
            'operation_name' => 'postActualIssue',
            'state' => 'in_flight',
            'payload_hash' => str_repeat('0', 64),
            'response_code' => 200,
            'response_body' => '{}',
        ]);

        $this->asBrowserOfficer($this->custodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/actual-issue-operations/by-key?action_key={$inFlightKey}")
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'OPERATION_IN_FLIGHT');

        // Mid-session duty revocation -> 403 FORBIDDEN_DUTY
        DutyGrant::where('chapter_id', $this->chapterId)
            ->where('user_id', $this->custodianId)
            ->update(['status' => 'revoked']);

        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds", [
            'targets' => [[
                'stock_lot_id' => $lot->id,
                'basis_segment_id' => $lot->basis_segment_id,
                'offset_quantity' => '0',
                'quantity' => '2',
                'expected_lot_material_version' => $lot->material_version,
                'expected_stock_version' => $lot->stock_version,
            ]],
            'reason_code' => 'damage_review',
            'reason' => 'Should fail after revocation',
        ])->assertStatus(403)
            ->assertJsonPath('error.code', 'duty_denied');
    }

    public function test_cross_line_and_revise_overlapping_targets_rejected_with_422_without_mutation(): void
    {
        $lot = $this->postOpeningBaseline15To12Usable();
        $rf = $this->createApprovedRf10();
        $rfLineId = $rf['lines'][0]['id'];
        $res = $this->reserveQty($rf['id'], $rfLineId, $lot, '0', '6');

        $rfModel = InternalRf::findOrFail($rf['id']);

        // 1. Cross-line overlapping targets in prepareActualIssue -> 422 invalid_input with 0 issues created
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf['id']}/actual-issues", [
            'expected_rf_version' => $rfModel->version,
            'expected_rf_material_version' => $rfModel->material_version,
            'expected_rf_progress_version' => $rfModel->progress_version,
            'recipient_id' => $this->requesterId,
            'recipient_name' => 'Requester Team',
            'lines' => [
                [
                    'rf_line_id' => $rfLineId,
                    'reservation_id' => $res['id'],
                    'expected_reservation_version' => 1,
                    'expected_reservation_material_version' => 1,
                    'targets' => [[
                        'stock_lot_id' => $lot->id,
                        'basis_segment_id' => $lot->basis_segment_id,
                        'offset_quantity' => '0',
                        'quantity' => '4',
                        'expected_lot_material_version' => $lot->material_version,
                        'expected_stock_version' => $lot->stock_version,
                    ]],
                ],
                [
                    'rf_line_id' => $rfLineId,
                    'reservation_id' => $res['id'],
                    'expected_reservation_version' => 1,
                    'expected_reservation_material_version' => 1,
                    'targets' => [[
                        'stock_lot_id' => $lot->id,
                        'basis_segment_id' => $lot->basis_segment_id,
                        'offset_quantity' => '2',
                        'quantity' => '3',
                        'expected_lot_material_version' => $lot->material_version,
                        'expected_stock_version' => $lot->stock_version,
                    ]],
                ],
            ],
            'handed_over_at' => null,
            'acknowledged_at' => null,
            'recipient_accepts_partial' => true,
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'invalid_input');

        $this->assertSame(0, ActualIssue::where('chapter_id', $this->chapterId)->count());

        // 2. Prepare valid issue first, then revise with overlapping targets -> 422 invalid_input without mutating lines/version
        $prep = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf['id']}/actual-issues", [
            'expected_rf_version' => $rfModel->version,
            'expected_rf_material_version' => $rfModel->material_version,
            'expected_rf_progress_version' => $rfModel->progress_version,
            'recipient_id' => $this->requesterId,
            'recipient_name' => 'Requester Team',
            'lines' => [[
                'rf_line_id' => $rfLineId,
                'reservation_id' => $res['id'],
                'expected_reservation_version' => 1,
                'expected_reservation_material_version' => 1,
                'targets' => [[
                    'stock_lot_id' => $lot->id,
                    'basis_segment_id' => $lot->basis_segment_id,
                    'offset_quantity' => '0',
                    'quantity' => '4',
                    'expected_lot_material_version' => $lot->material_version,
                    'expected_stock_version' => $lot->stock_version,
                ]],
            ]],
            'handed_over_at' => null,
            'acknowledged_at' => null,
            'recipient_accepts_partial' => true,
        ])->assertStatus(201)->json('data');

        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->putJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$prep['id']}", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'lines' => [[
                'rf_line_id' => $rfLineId,
                'reservation_id' => $res['id'],
                'targets' => [
                    [
                        'stock_lot_id' => $lot->id,
                        'basis_segment_id' => $lot->basis_segment_id,
                        'offset_quantity' => '0',
                        'quantity' => '3',
                    ],
                    [
                        'stock_lot_id' => $lot->id,
                        'basis_segment_id' => $lot->basis_segment_id,
                        'offset_quantity' => '2',
                        'quantity' => '2',
                    ],
                ],
            ]],
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'invalid_input');

        $unchanged = ActualIssue::with('lines')->findOrFail($prep['id']);
        $this->assertSame(1, $unchanged->version);
        $this->assertSame(1, $unchanged->material_version);
        $this->assertCount(1, $unchanged->lines);
        $this->assertEquals(4.0, (float) $unchanged->lines->first()->issued_quantity);
    }
}
