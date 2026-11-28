<?php

namespace Tests\Feature\Stage2;

use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\ChapterOpeningGuard;
use App\Models\DutyGrant;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use App\Models\InternalRf;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\User;
use App\Services\Evidence\PaperEvidenceStore;
use App\Services\Inventory\Participants\PrepareReceivingInventoryParticipant;
use App\Services\Inventory\StockViewQueryService;
use App\Services\Shared\ReferenceSequenceService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\TestCase;

class InventoryDay3PoReceivingAcceptanceTest extends TestCase
{
    use AuthenticatesBrowserOfficer;
    use RefreshDatabase;

    private string $chapterId;

    private string $requesterId;

    private string $approverId;

    private string $approverGrantId;

    private string $custodianId;

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
        $this->requesterId = (string) Str::uuid();
        $this->approverId = (string) Str::uuid();
        $this->custodianId = (string) Str::uuid();
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
            $this->requesterId => ['req@example.invalid', 'Requester', ['COMMITTEE_REQUESTER']],
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

        $this->seedEffectiveStage1Policies(
            $this->chapterId,
            $this->headUserId,
            $this->financeUserId,
            $this->requestingUnitId,
            $this->approverGrantId
        );

        ChapterOpeningGuard::updateOrCreate(
            ['chapter_id' => $this->chapterId],
            [
                'stock_version' => 1,
                'posted_rm_id' => (string) Str::uuid(),
                'posted_ipc_id' => (string) Str::uuid(),
                'outcome_id' => (string) Str::uuid(),
                'outcome_json' => ['stock_version' => 1],
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

    public function test_po_receiving_discrepancy_replacement_shared_rm_sequence_and_stage1_repeated_issue_flow(): void
    {
        // Shared yearly chapter RM counter interleaving with Stage 1 /opening-rms guarantees unique monotonic refs.
        $seqService = app(ReferenceSequenceService::class);
        $openingRmSeq = $seqService->nextReference($this->chapterId, 'RM');
        $poRm1Seq = $seqService->nextReference($this->chapterId, 'RM');
        $poRm2Seq = $seqService->nextReference($this->chapterId, 'RM');

        $this->assertSame(1, $openingRmSeq['sequence']);
        $this->assertSame(2, $poRm1Seq['sequence']);
        $this->assertSame(3, $poRm2Seq['sequence']);
        $this->assertCount(3, array_unique([$openingRmSeq['reference'], $poRm1Seq['reference'], $poRm2Seq['reference']]));

        $poId = (string) Str::uuid();
        $poLineId = (string) Str::uuid();
        $rm1Id = (string) Str::uuid();

        // 1. PO 100 / RM1 40 accepted + 10 rejected -> +40 usable, +10 rejected, 60 remaining open.
        $ack1 = $this->seedPngEvidenceAcknowledgment($rm1Id, 'po_supplier_dr', $this->custodianId);
        $res1 = DB::transaction(fn () => app(PrepareReceivingInventoryParticipant::class)->prepare(
            $this->makePoInput($rm1Id, $poRm1Seq['reference'], $poId, 'PO-2026-0001', 1, $ack1, [
                $this->makePoLine((string) Str::uuid(), $poLineId, '50', '40', '0', '10', '240.00', '10 shirts rejected at dock.'),
            ]),
            [
                'source_status' => 'issued',
                'source_material_version' => 2,
                'lines' => [
                    $poLineId => [
                        'variant_id' => $this->variantPcsId,
                        'unit_id' => $this->unitPcsId,
                        'unit_valuation_php' => '240.00',
                        'accepted_quantity' => '0',
                        'rejected_or_disputed_quantity' => '0',
                        'outstanding_quantity' => '100',
                    ],
                ],
            ],
            CarbonImmutable::parse('2026-11-26T08:40:00.000000Z')
        ));

        $this->assertSame('ready', $res1['outcome']);
        $this->assertSame(2, $res1['stock_version']);
        $this->assertSame('60', $res1['source_line_updates'][0]['new_outstanding_quantity']);
        $this->assertSame('partially_received', $res1['source_line_updates'][0]['new_source_status']);
        $discrepancyId = $res1['created_discrepancies'][0]['discrepancy_id'];

        // 2. Unamended overdelivery above 60 is blocked; replacement via new PO-RM for 60 succeeds and completes PO.
        $rm2Id = (string) Str::uuid();
        $ack2 = $this->seedPngEvidenceAcknowledgment($rm2Id, 'po_supplier_dr', $this->custodianId);
        $ctxPartial = [
            'source_status' => 'partially_received',
            'source_material_version' => 2,
            'open_discrepancy_ids' => [$discrepancyId],
            'lines' => [
                $poLineId => [
                    'variant_id' => $this->variantPcsId,
                    'unit_id' => $this->unitPcsId,
                    'unit_valuation_php' => '240.00',
                    'accepted_quantity' => '40',
                    'rejected_or_disputed_quantity' => '10',
                    'outstanding_quantity' => '60',
                ],
            ],
        ];

        $blockedOver = DB::transaction(fn () => app(PrepareReceivingInventoryParticipant::class)->prepare(
            $this->makePoInput($rm2Id, $poRm2Seq['reference'], $poId, 'PO-2026-0001', 2, $ack2, [
                $this->makePoLine((string) Str::uuid(), $poLineId, '61', '61', '0', '0', '240.00', null, $discrepancyId),
            ]),
            $ctxPartial
        ));
        $this->assertSame(['outcome' => 'rejected', 'reason' => 'substitution_or_overdelivery_blocked'], $blockedOver);

        $res2 = DB::transaction(fn () => app(PrepareReceivingInventoryParticipant::class)->prepare(
            $this->makePoInput($rm2Id, $poRm2Seq['reference'], $poId, 'PO-2026-0001', 2, $ack2, [
                $this->makePoLine((string) Str::uuid(), $poLineId, '60', '60', '0', '0', '240.00', null, $discrepancyId),
            ]),
            $ctxPartial,
            CarbonImmutable::parse('2026-11-26T14:20:00.000000Z')
        ));
        $this->assertSame('ready', $res2['outcome']);
        $this->assertSame('100', $res2['source_line_updates'][0]['new_accepted_quantity']);
        $this->assertSame('0', $res2['source_line_updates'][0]['new_outstanding_quantity']);
        $this->assertSame('receiving_complete', $res2['source_line_updates'][0]['new_source_status']);

        $viewsAfterReceiving = app(StockViewQueryService::class)->getSevenViews($this->chapterId, $this->variantPcsId, 0);
        $this->assertSame('100', $viewsAfterReceiving['usable_stockroom_on_hand']['quantity']);
        $this->assertSame('100', $viewsAfterReceiving['available_to_allocate']['quantity']);
        $this->assertSame('10', $viewsAfterReceiving['quarantined_rejected']['quantity']);

        // 3. Stage 2 -> Stage 1 AC-15 handoff: PO-RM usable lot reserves & issues repeatedly via unchanged Stage 1 routes.
        $lot1 = InventoryLot::findOrFail($res1['usable_lots'][0]['lot_id']);
        $rf = $this->createApprovedRfViaHttp('25');
        $rfId = $rf['id'];
        $rfLineId = $rf['lines'][0]['id'];

        $this->asBrowserOfficer($this->custodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/allocation-review")
            ->assertOk()
            ->assertJsonFragment(['stock_lot_id' => $lot1->id]);

        $prep = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations", [
                'expected_rf_version' => $rf['version'],
                'expected_rf_material_version' => $rf['material_version'],
                'expected_rf_progress_version' => $rf['progress_version'],
                'rf_line_id' => $rfLineId,
                'targets' => [[
                    'stock_lot_id' => $lot1->id,
                    'basis_segment_id' => $lot1->basis_segment_id,
                    'offset_quantity' => '0',
                    'quantity' => '25',
                    'expected_lot_material_version' => $lot1->material_version,
                    'expected_stock_version' => $lot1->stock_version,
                ]],
                'override_policy_id' => null,
                'reason' => 'Reserve 25 from Stage 2 PO-RM lot',
            ])->assertStatus(201)->json('data.result');

        $reservation = $this->asBrowserOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations/{$prep['id']}/commit", [
                'expected_preparation_version' => 1,
                'expected_rf_version' => $rf['version'],
                'expected_rf_material_version' => $rf['material_version'],
                'expected_rf_progress_version' => $rf['progress_version'],
            ])->assertStatus(201)->json('data.result');

        // Repeated signed partial issues: 15 then 10.
        $this->prepareAcknowledgeAndPostIssue($rfId, $rfLineId, $reservation, $lot1, '0', '15');
        $resUpdated = $this->asBrowserOfficer($this->custodianId)
            ->getJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservations/{$reservation['id']}")
            ->assertOk()->json('data');
        $lot1->refresh();
        $this->prepareAcknowledgeAndPostIssue($rfId, $rfLineId, $resUpdated, $lot1, '15', '10');

        $viewsFinal = app(StockViewQueryService::class)->getSevenViews($this->chapterId, $this->variantPcsId, 0);
        $this->assertSame('75', $viewsFinal['usable_stockroom_on_hand']['quantity']);
        $this->assertSame('0', $viewsFinal['rf_reserved']['quantity']);
        $this->assertSame('75', $viewsFinal['available_to_allocate']['quantity']);
        $this->assertSame('10', $viewsFinal['quarantined_rejected']['quantity']);
        $this->assertSame('fulfilled', InternalRf::findOrFail($rfId)->fulfillment_status);
    }

    public function test_stage2_day3_contracts_verify_allocation_queue_read_only_inv09_ordering_and_hold_isolation(): void
    {
        $openapiYaml = file_get_contents(base_path('../contracts/stage2/openapi.yaml'));
        $handoffYaml = file_get_contents(base_path('../contracts/stage2/handoff.yaml'));
        $this->assertNotFalse($openapiYaml);
        $this->assertNotFalse($handoffYaml);

        $queuePos = strpos($openapiYaml, "    AllocationQueueList:\n");
        $this->assertNotFalse($queuePos);
        $queueBlock = substr($openapiYaml, $queuePos, 900);
        $this->assertStringContainsString('is_commit_authorization:', $queueBlock);
        $this->assertStringContainsString('const: false', $queueBlock);

        $queueProfilePos = strpos($handoffYaml, "  allocation_queue:\n");
        $this->assertNotFalse($queueProfilePos);
        $this->assertStringContainsString('owner: Glenn', substr($handoffYaml, $queueProfilePos, 300));
    }

    private function createApprovedRfViaHttp(string $qty): array
    {
        $rf = $this->asBrowserOfficer($this->requesterId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs", [
                'purpose' => 'internal_use',
                'requesting_unit_id' => $this->requestingUnitId,
                'event_id' => null,
                'needed_at' => '2026-11-30T09:00:00Z',
                'justification' => 'Day 3 PO-RM fulfillment',
                'lines' => [[
                    'line_id' => null,
                    'variant_id' => $this->variantPcsId,
                    'unit_id' => $this->unitPcsId,
                    'requested_quantity' => $qty,
                ]],
            ])->assertStatus(201)->json('data.result');

        $this->asBrowserOfficer($this->requesterId, (string) Str::uuid())
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

    private function prepareAcknowledgeAndPostIssue(
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

        $this->assertGreaterThan(0, InventoryMovement::where('lot_id', $lot->id)->count());
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
            'matched_at' => '2026-11-26T08:25:00.000000Z',
            'recipient_id' => null,
            'acknowledged_at' => '2026-11-26T08:25:00.000000Z',
            'snapshot' => [
                'target' => ['purpose' => $purpose, 'record_id' => $rmId],
                'material_version' => 1,
                'sha256' => hash('sha256', $rmId),
            ],
            'bytes' => $this->seedPngByteBinding($rmId, $purpose, $actorId),
        ];
    }

    /** @return array<string, mixed> */
    private function makePoInput(
        string $rmId,
        string $rmRef,
        string $sourceId,
        string $sourceRef,
        int $stockVersion,
        array $acknowledgment,
        array $lines
    ): array {
        return [
            'actor_id' => $this->custodianId,
            'chapter_id' => $this->chapterId,
            'operation_id' => (string) Str::uuid(),
            'source_kind' => 'po_rm',
            'rm_id' => $rmId,
            'rm_reference' => $rmRef,
            'rm_material_version' => 1,
            'source_id' => $sourceId,
            'source_reference' => $sourceRef,
            'source_material_version' => 2,
            'donor_id' => null,
            'donor_name' => null,
            'location_id' => $this->locationId,
            'current_stock_version' => $stockVersion,
            'acknowledgment' => $acknowledgment,
            'lines' => $lines,
        ];
    }

    /** @return array<string, mixed> */
    private function makePoLine(
        string $rmLineId,
        string $sourceLineId,
        string $delivered,
        string $accepted,
        string $damaged,
        string $rejected,
        string $unitValuationPhp,
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
            'restrictions' => [
                'state' => 'unrestricted',
                'allowed_uses' => [],
                'event_ids' => [],
                'requesting_unit_ids' => [],
                'effective_from' => null,
                'effective_until' => null,
                'interpretation_id' => null,
                'source_condition_reference' => null,
            ],
            'discrepancy_notes' => $discrepancyNotes,
            'resolves_discrepancy_id' => $resolvesDiscrepancyId,
        ];
    }
}
