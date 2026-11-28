<?php

namespace Tests\Feature\Stage1B;

use App\Models\ActualIssue;
use App\Models\AuditLog;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\InternalRf;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\PolicyRecord;
use App\Models\RfReservationAllocation;
use App\Models\StockHold;
use App\Models\StockReservation;
use App\Models\User;
use App\Services\Inventory\PhysicalPostingService;
use App\Services\Inventory\StockViewQueryService;
use App\Services\Shared\CanonicalJson;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\TestCase;

class InternalRfAndReservationTest extends TestCase
{
    use AuthenticatesBrowserOfficer;
    use RefreshDatabase;

    private string $chapterId;

    private string $foreignChapterId;

    private string $requesterId;

    private string $approverId;

    private string $approverGrantId;

    private string $headId;

    private string $financeId;

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
        Storage::fake('evidence');

        $this->chapterId = (string) Str::uuid();
        $this->foreignChapterId = (string) Str::uuid();
        $this->requesterId = (string) Str::uuid();
        $this->approverId = (string) Str::uuid();
        $this->headId = (string) Str::uuid();
        $this->financeId = (string) Str::uuid();
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
            $this->headId => ['head@example.invalid', 'Chapter Head', ['CHAPTER_HEAD']],
            $this->financeId => ['finance@example.invalid', 'Finance Officer', ['FINANCE']],
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

        $this->seedEffectiveStage1Policies(
            $this->chapterId,
            $this->headId,
            $this->financeId,
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
        $createResp = $this->asBrowserOfficer($this->requesterId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs", [
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

        $submitResp = $this->asBrowserOfficer($this->requesterId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/submit", [
            'expected_version' => 1,
            'expected_material_version' => 1,
        ])->assertStatus(200);

        $approveResp = $this->asBrowserOfficer($this->approverId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/approve", [
            'expected_version' => 2,
            'expected_material_version' => 1,
        ])->assertStatus(200);

        return $approveResp->json('data.result');
    }

    public function test_full_rf_lifecycle_gov05_self_approval_denial_and_formal_cancellation(): void
    {
        // 1. Create incomplete draft
        $draftKey = (string) Str::uuid();
        $draftResp = $this->asBrowserOfficer($this->requesterId, $draftKey)->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs", [
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
        $this->asBrowserOfficer($this->requesterId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/submit", [
            'expected_version' => 1,
            'expected_material_version' => 1,
        ])->assertStatus(422);

        // 2. Replace draft with complete line
        $replaceResp = $this->asBrowserOfficer($this->requesterId, (string) Str::uuid())->putJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}", [
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
        $submitResp = $this->asBrowserOfficer($this->requesterId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/submit", [
            'expected_version' => 2,
            'expected_material_version' => 2,
        ]);
        $submitResp->assertStatus(200)
            ->assertJsonPath('data.result.status', 'submitted');

        $rfNumber = $submitResp->json('data.result.reference');
        $this->assertNotNull($rfNumber);

        // 4. GOV-05: Self-approval denied (403 independence_required)
        $this->asBrowserOfficer($this->requesterId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/approve", [
            'expected_version' => 3,
            'expected_material_version' => 2,
        ])->assertStatus(403)
            ->assertJsonPath('error.code', 'independence_required');

        // 5. Independent approver returns RF with reason
        $returnResp = $this->asBrowserOfficer($this->approverId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/return", [
            'expected_version' => 3,
            'expected_material_version' => 2,
            'reason' => 'Clarify justification',
        ]);
        $returnResp->assertStatus(200)
            ->assertJsonPath('data.result.status', 'returned')
            ->assertJsonPath('data.result.reference', $rfNumber);

        // 6. Revise returned RF retains line ID and RF number
        $reviseResp = $this->asBrowserOfficer($this->requesterId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/revise", [
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
        $this->asBrowserOfficer($this->requesterId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/submit", [
            'expected_version' => 5,
            'expected_material_version' => 3,
        ])->assertStatus(200)
            ->assertJsonPath('data.result.reference', $rfNumber);

        $approveKey = (string) Str::uuid();
        $approveResp = $this->asBrowserOfficer($this->approverId, $approveKey)->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/approve", [
            'expected_version' => 6,
            'expected_material_version' => 3,
        ]);
        $approveResp->assertStatus(200)
            ->assertJsonPath('data.result.status', 'approved')
            ->assertJsonPath('data.result.fulfillment', 'outstanding')
            ->assertJsonPath('data.result.lines.0.progress.approved_quantity', '10');

        // Verify history, version read, related records, and operation recovery by key
        $this->asBrowserOfficer($this->requesterId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/history")
            ->assertStatus(200)
            ->assertJsonCount(7, 'data');

        $this->asBrowserOfficer($this->requesterId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/versions/7")
            ->assertStatus(200)
            ->assertJsonPath('data.snapshot.status', 'approved');

        $this->asBrowserOfficer($this->approverId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/operation-results?action_key={$approveKey}")
            ->assertStatus(200)
            ->assertJsonPath('data.result.status', 'approved');

        // Formal remainder cancellation
        $cancelResp = $this->asBrowserOfficer($this->requesterId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/cancel", [
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

    private function seedAllocationPolicy(string $key, string $schema, array $value, ?string $subjectId = null): void
    {
        $id = (string) Str::uuid();
        PolicyRecord::create([
            'id' => $id,
            'aggregate_id' => $id,
            'chapter_id' => $this->chapterId,
            'policy_code' => $key,
            'policy_version' => 1,
            'rules_json' => $value,
            'effective_from' => now()->subDay(),
        ]);
        AuditLog::create([
            'chapter_id' => $this->chapterId,
            'user_id' => $this->headId,
            'action' => 'controlled:recordPolicy',
            'entity_type' => 'policy',
            'entity_id' => $id,
            'details' => [
                'version' => 1,
                'subject_id' => $subjectId,
                'value_schema_reference' => '#/components/schemas/'.$schema,
                'value_sha256' => CanonicalJson::sha256($value),
                'approvals' => [['id' => (string) Str::uuid(), 'authority' => 'CHAPTER_HEAD', 'approver_id' => $this->headId]],
            ],
        ]);
    }

    public function test_allocation_queue_only_pages_visible_lines_and_returns_uniform_not_found(): void
    {
        $this->seedAllocationPolicy('allocation_priority', 'AllocationPriorityPolicyValue', [
            'priorities' => [['requesting_unit_id' => $this->requestingUnitId, 'rank' => 1]],
            'overrides' => [],
        ]);
        $this->seedAllocationPolicy('quantity_scale', 'CatalogueQuantityPolicyValue', [
            'unit_id' => $this->unitId,
            'quantity_scale' => 0,
        ], $this->variantId);

        $lot = $this->seedLot(8);
        $first = $this->createAndApproveRf(4);
        $second = $this->createAndApproveRf(4);
        $hidden = $this->createAndApproveRf(4);
        $hiddenUnit = (string) Str::uuid();
        InternalRf::findOrFail($hidden['id'])->update(['requesting_unit_id' => $hiddenUnit]);
        DutyGrant::where('user_id', $this->custodianId)->where('duty_code', 'INVENTORY')
            ->firstOrFail()->update(['scope' => ['unit_id' => $this->requestingUnitId]]);

        $route = "/api/v1/chapters/{$this->chapterId}/allocation-queue";
        $request = $this->asBrowserOfficer($this->custodianId);
        $pageOne = $request->getJson("$route?limit=1")->assertOk()
            ->assertJsonPath('is_commit_authorization', false)
            ->assertJsonPath('data.0.eligible_sources.0.stock_lot_id', $lot->id);
        $cursor = rawurlencode($pageOne->json('page.next_cursor'));
        $pageTwo = $request->getJson("$route?limit=1&cursor=$cursor")->assertOk()
            ->assertJsonPath('page.next_cursor', null);
        $this->assertEqualsCanonicalizing(
            [$first['id'], $second['id']],
            [$pageOne->json('data.0.rf_id'), $pageTwo->json('data.0.rf_id')],
        );
        $request->getJson("$route?rf_id={$hidden['id']}")->assertNotFound()
            ->assertJsonPath('error.code', 'resource_not_found');
        $unknown = (string) Str::uuid();
        $foreign = InternalRf::findOrFail($hidden['id']);
        $foreign->update(['chapter_id' => $this->foreignChapterId]);
        foreach ([$unknown, $hiddenUnit] as $unit) {
            $request->getJson("$route?requesting_unit_id=$unit")->assertNotFound()
                ->assertJsonPath('error.code', 'resource_not_found')
                ->assertJsonPath('error.message', 'Resource not found.');
        }
    }

    public function test_reads_and_reserves_the_free_portion_of_a_bounded_lot(): void
    {
        $lot = $this->seedLot(10, 'DA-STOCK');
        $free = $this->seedLot(4, 'OPENING-STOCK');
        $unresolved = $this->seedLot(3, 'UNRESOLVED-STOCK');
        $unresolved->update(['immediately_allocatable' => false]);
        $otherSegment = (string) Str::uuid();
        $bounded = [
            'state' => 'bounded',
            'allowed_uses' => ['internal_use'],
            'event_ids' => [],
            'requesting_unit_ids' => [$this->requestingUnitId],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => null,
            'source_condition_reference' => 'Donor letter A',
        ];
        $lot->update(['source_kind' => 'da_rm', 'segments' => [
            ['basis_segment_id' => $lot->basis_segment_id, 'offset_quantity' => '0', 'quantity' => '5', 'restrictions' => $bounded],
            ['basis_segment_id' => $otherSegment, 'offset_quantity' => '5', 'quantity' => '5', 'restrictions' => array_replace($bounded, [
                'allowed_uses' => [],
                'requesting_unit_ids' => [],
                'state' => 'uninterpreted',
            ])],
        ]]);
        $rf = $this->createAndApproveRf(8);
        $chapter = "/api/v1/chapters/{$this->chapterId}";
        $rfRoute = "$chapter/internal-rfs/{$rf['id']}";
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("$chapter/stock-holds", [
            'reason_code' => 'damage_review',
            'reason' => 'Inspect last usable unit and unresolved stock',
            'targets' => [[
                'stock_lot_id' => $lot->id, 'basis_segment_id' => $lot->basis_segment_id,
                'offset_quantity' => '4', 'quantity' => '3',
                'expected_lot_material_version' => $lot->material_version, 'expected_stock_version' => $lot->stock_version,
            ]],
        ])->assertCreated();
        $lot->refresh();
        $officer = $this->asBrowserOfficer($this->custodianId);
        $officer->getJson("$chapter/stock/lots/{$lot->id}/eligibility?intended_use=sale")->assertOk()
            ->assertJsonPath('data.eligible', false);
        $officer->getJson("$chapter/stock/lots/{$free->id}/eligibility?intended_use=sale")->assertOk()
            ->assertJsonPath('data.eligible', true);
        $officer->getJson("$chapter/stock/lots/{$lot->id}/eligibility?rf_id={$rf['id']}")->assertBadRequest()
            ->assertJsonPath('error.code', 'invalid_selector');

        $review = $officer->getJson("$rfRoute/allocation-review")->assertOk();
        $candidate = collect($review->json('data.lines.0.candidate_lots'))->firstWhere('stock_lot_id', $lot->id);
        $this->assertSame([['basis_segment_id' => $lot->basis_segment_id, 'offset_quantity' => '0', 'quantity' => '4']], $candidate['free_intervals']);
        $this->assertSame('8', $review->json('data.lines.0.views.available_to_allocate.quantity'));
        $summary = $officer->getJson("$rfRoute/allocation-review?rf_line_id={$rf['lines'][0]['id']}")->assertOk()
            ->assertJsonPath('data.free_eligible_quantity', '8')->assertJsonPath('data.is_commit_authorization', false);
        $this->assertEqualsCanonicalizing([
            'rf_id', 'rf_line_id', 'rf_version', 'rf_material_version', 'rf_progress_version', 'progress',
            'free_eligible_quantity', 'uncovered_quantity', 'allocation_policy', 'ordered_demands',
            'queue_next_cursor', 'setup_blockers', 'observed_at', 'is_commit_authorization',
        ], array_keys($summary->json('data')));

        $versions = [
            'expected_rf_version' => $rf['version'],
            'expected_rf_material_version' => $rf['material_version'],
            'expected_rf_progress_version' => $rf['progress_version'],
        ];
        $target = [
            'stock_lot_id' => $lot->id, 'basis_segment_id' => $lot->basis_segment_id,
            'offset_quantity' => '0', 'quantity' => '4',
            'expected_lot_material_version' => $candidate['material_version'], 'expected_stock_version' => $candidate['stock_version'],
        ];
        foreach ([
            [array_replace($target, ['offset_quantity' => '3']), 'availability_conflict'],
            [array_replace($target, ['offset_quantity' => '4', 'quantity' => '1']), 'availability_conflict'],
            [array_replace($target, ['basis_segment_id' => $otherSegment, 'offset_quantity' => '8', 'quantity' => '1']), 'restriction_unsupported'],
            [$target, null],
        ] as [$requested, $error]) {
            $prep = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("$rfRoute/reservation-preparations", $versions + [
                'rf_line_id' => $rf['lines'][0]['id'], 'targets' => [$requested], 'override_policy_id' => null, 'reason' => 'Workshop stock',
            ])->assertCreated()->json('data.resource_id');
            $commit = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson(
                "$rfRoute/reservation-preparations/$prep/commit", $versions + ['expected_preparation_version' => 1],
            );
            if ($error !== null) {
                $commit->assertConflict()->assertJsonPath('error.code', $error)->assertJsonPath('failed_intent_committed', false);
                $this->assertSame(0, RfReservationAllocation::count());
            } else {
                $commit->assertCreated()->assertJsonPath('data.result.committed_quantity', '4');
            }
        }
        $this->assertSame('4.000000', app(StockViewQueryService::class)->getRawMetrics($this->chapterId, $this->variantId)['available_to_allocate_str']);
    }

    public function test_commit_and_reallocation_reject_stock_outside_the_selected_rf_line_or_basis_segment(): void
    {
        $lot = $this->seedLot(6);
        $otherVariant = CatalogueVariant::findOrFail($this->variantId)->replicate();
        $otherVariant->fill(['code' => 'OTHER-KIT', 'sku' => 'OTHER-KIT'])->save();
        $otherUnit = CatalogueUnit::findOrFail($this->unitId)->replicate();
        $otherUnit->fill(['code' => 'BOX'])->save();
        $wrongVariant = $this->seedLot(6, 'OTHER-VARIANT');
        $wrongVariant->update(['variant_id' => $otherVariant->id]);
        $wrongUnit = $this->seedLot(6, 'OTHER-UNIT');
        $wrongUnit->update(['unit_id' => $otherUnit->id]);

        $rf = $this->createAndApproveRf(6);
        $base = "/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf['id']}";
        $versions = [
            'expected_rf_version' => $rf['version'],
            'expected_rf_material_version' => $rf['material_version'],
            'expected_rf_progress_version' => $rf['progress_version'],
        ];
        $target = static fn (InventoryLot $lot, ?string $segmentId = null): array => [
            'stock_lot_id' => $lot->id,
            'basis_segment_id' => $segmentId ?? $lot->basis_segment_id,
            'offset_quantity' => '0',
            'quantity' => '2',
            'expected_lot_material_version' => $lot->material_version,
            'expected_stock_version' => $lot->stock_version,
        ];
        $invalid = [$target($wrongVariant), $target($wrongUnit), $target($lot, (string) Str::uuid())];
        foreach ([...$invalid, $target($lot)] as $index => $selected) {
            $prep = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("$base/reservation-preparations", $versions + [
                'rf_line_id' => $rf['lines'][0]['id'],
                'targets' => [$selected],
                'override_policy_id' => null,
                'reason' => 'Reserve available stock',
            ])->assertCreated()->json('data.resource_id');

            $commit = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson(
                "$base/reservation-preparations/$prep/commit", $versions + ['expected_preparation_version' => 1],
            );
            if ($index < count($invalid)) {
                $commit->assertConflict()
                    ->assertJsonPath('error.code', 'availability_conflict')
                    ->assertJsonPath('failed_intent_committed', false);
                $this->assertSame(0, StockReservation::count());
                $this->assertSame($lot->stock_version, $lot->refresh()->stock_version);
                $this->assertSame($rf['progress_version'], InternalRf::findOrFail($rf['id'])->progress_version);
            } else {
                $committed = $commit->assertCreated()->json('data.result');
            }
        }

        $updatedRf = InternalRf::findOrFail($rf['id']);
        $before = RfReservationAllocation::where('reservation_id', $committed['id'])->get()->toArray();
        foreach ($invalid as $selection) {
            $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("$base/reservations/{$committed['id']}/reallocate", [
                'expected_rf_version' => $updatedRf->version,
                'expected_rf_material_version' => $updatedRf->material_version,
                'expected_rf_progress_version' => $updatedRf->progress_version,
                'expected_version' => $committed['version'],
                'expected_material_version' => $committed['material_version'],
                'from_ranges' => [array_intersect_key($target($lot), array_flip(['stock_lot_id', 'basis_segment_id', 'offset_quantity', 'quantity']))],
                'to_targets' => [$selection],
                'reason' => 'Move the reservation',
            ])->assertConflict()
                ->assertJsonPath('error.code', 'availability_conflict')
                ->assertJsonPath('failed_intent_committed', false);

            $this->assertSame($before, RfReservationAllocation::where('reservation_id', $committed['id'])->get()->toArray());
            $this->assertSame($updatedRf->progress_version, $updatedRf->fresh()->progress_version);
        }
    }

    public function test_fixture_b_exact_ten_vs_available_six_409_then_explicit_six_and_commitment_conflict_on_cancel(): void
    {
        $lot = $this->seedLot(6, 'LOT-SIX');
        $rf = $this->createAndApproveRf(10);
        $rfId = $rf['id'];
        $rfLineId = $rf['lines'][0]['id'];

        // Prepare exact 10 (preparation commits nothing)
        $prep10 = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations", [
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
        $commit10 = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations/{$prep10Id}/commit", [
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
        $prep6 = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations", [
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
        $commit6 = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations/{$prep6Id}/commit", [
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
        $this->asBrowserOfficer($this->requesterId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/cancel", [
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
        $prep = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations", [
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

        $resResp = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations/{$prep->json('data.resource_id')}/commit", [
            'expected_preparation_version' => 1,
            'expected_rf_version' => $rf['version'],
            'expected_rf_material_version' => $rf['material_version'],
            'expected_rf_progress_version' => $rf['progress_version'],
        ])->assertStatus(201);

        $reservationId = $resResp->json('data.resource_id');

        // Prepare an ActualIssue batch on reservation (will later be invalidated by reallocation!)
        $issuePrep = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/actual-issues", [
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
        $hold1Resp = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds", [
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
        $hold2Resp = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds", [
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

        $resRead = $this->asBrowserOfficer($this->custodianId)
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
        $propResp = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->putJson("/api/v1/chapters/{$this->chapterId}/stock-holds/{$hold1Id}/clearance-proposal", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'resolution' => 'Cleared after physical reinspection',
            'condition_treatment_source_id' => null,
            'signatories' => [[
                'user_id' => $this->approverId,
                'role' => 'CHAPTER_HEAD',
                'signed_at' => now('UTC')->subMinute()->format('Y-m-d\TH:i:s.u\Z'),
            ]],
        ])->assertStatus(200);

        $sha1 = $propResp->json('data.result.clearance_proposal.material_sha256');
        $hold1Model = StockHold::findOrFail($hold1Id);
        [, , $byteBinding1] = $this->storeReadyPaperEvidence(
            $this->chapterId,
            $this->custodianId,
            'hold_clearance',
            $hold1Id,
            'Hold 1 Clearance',
        );

        // Non-preparer denied (403 duty_denied)
        $this->asBrowserOfficer($this->otherCustodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds/{$hold1Id}/clear", [
            'expected_version' => 2,
            'expected_material_version' => 2,
            'expected_snapshot' => [
                'target' => ['purpose' => 'hold_clearance', 'record_id' => $hold1Id],
                'material_version' => 2,
                'sha256' => $sha1,
            ],
            'evidence' => $byteBinding1,
            'matches_paper' => true,
        ])->assertStatus(403)
            ->assertJsonPath('error.code', 'duty_denied');

        $movementsBeforeClear = InventoryMovement::count();

        // Original preparer clears Hold 1 -> Hold 2 [2, 6) remains -> blocked drops from 6 to 4!
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds/{$hold1Id}/clear", [
            'expected_version' => 2,
            'expected_material_version' => 2,
            'expected_snapshot' => [
                'target' => ['purpose' => 'hold_clearance', 'record_id' => $hold1Id],
                'material_version' => 2,
                'sha256' => $sha1,
            ],
            'evidence' => $byteBinding1,
            'matches_paper' => true,
        ])->assertStatus(200)
            ->assertJsonPath('data.result.status', 'cleared');

        // Zero physical movement on hold clearance
        $this->assertSame($movementsBeforeClear, InventoryMovement::count());

        $this->asBrowserOfficer($this->custodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservations/{$reservationId}")
            ->assertStatus(200)
            ->assertJsonPath('data.blocked_quantity', '4')
            ->assertJsonPath('data.status', 'partially_blocked');

        // Reallocate full 6 from Lot A (including held [2,6)) to Lot B -> retains reservation ID & invalidates prepared batch!
        $resNow = StockReservation::findOrFail($reservationId);
        $rfNow = InternalRf::findOrFail($rfId);

        $reallocResp = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservations/{$reservationId}/reallocate", [
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
        $p1 = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf1['id']}/reservation-preparations", [
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

        $p2 = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf2['id']}/reservation-preparations", [
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
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf1['id']}/reservation-preparations/{$p1->json('data.resource_id')}/commit", [
            'expected_preparation_version' => 1,
            'expected_rf_version' => $rf1['version'],
            'expected_rf_material_version' => $rf1['material_version'],
            'expected_rf_progress_version' => $rf1['progress_version'],
        ])->assertStatus(201);

        // Second commit MUST fail 409 availability_conflict with zero double-allocation
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf2['id']}/reservation-preparations/{$p2->json('data.resource_id')}/commit", [
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
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rf['id']}/reservation-preparations", [
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
        $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds", [
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
