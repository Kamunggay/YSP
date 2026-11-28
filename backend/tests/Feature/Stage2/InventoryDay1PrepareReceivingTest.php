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
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\InventoryPosting;
use App\Models\PolicyRecord;
use App\Models\User;
use App\Services\Evidence\PaperEvidenceStore;
use App\Services\Inventory\Participants\PrepareReceivingInventoryParticipant;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\TestCase;

class InventoryDay1PrepareReceivingTest extends TestCase
{
    use AuthenticatesBrowserOfficer;
    use RefreshDatabase;

    private string $chapterId;

    private string $receivingUserId;

    private string $headUserId;

    private string $financeUserId;

    private string $unitPcsId;

    private string $unitKgId;

    private string $itemId;

    private string $variantPcsId;

    private string $variantKgId;

    private string $locationId;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('evidence');

        $this->chapterId = (string) Str::uuid();
        $this->receivingUserId = (string) Str::uuid();
        $this->headUserId = (string) Str::uuid();
        $this->financeUserId = (string) Str::uuid();

        Chapter::create([
            'id' => $this->chapterId,
            'code' => 'SYN-CEBU',
            'name' => 'Cebu Chapter',
            'status' => 'live',
            'version' => 1,
        ]);

        foreach ([
            $this->receivingUserId => ['receiver@example.invalid', 'Receiving Officer', ['RECEIVING', 'INVENTORY']],
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

        $this->unitKgId = (string) Str::uuid();
        CatalogueUnit::create([
            'id' => $this->unitKgId,
            'chapter_id' => $this->chapterId,
            'code' => 'KG',
            'name' => 'Kilograms',
            'quantity_kind' => 'mass',
            'quantity_scale' => 3,
            'state' => 'active',
            'material_version' => 1,
        ]);

        $this->itemId = (string) Str::uuid();
        CatalogueItem::create([
            'id' => $this->itemId,
            'chapter_id' => $this->chapterId,
            'code' => 'ITEM-KIT',
            'name' => 'Chapter Logistics Item',
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

        $this->variantKgId = (string) Str::uuid();
        CatalogueVariant::create([
            'id' => $this->variantKgId,
            'chapter_id' => $this->chapterId,
            'item_id' => $this->itemId,
            'sku' => 'RICE-KG',
            'name' => 'Rice Bulk',
            'label' => 'Rice Bulk',
            'unit_id' => $this->unitKgId,
            'quantity_scale' => 3,
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

    public function test_po_100_rm_40_accepted_and_10_rejected_enforces_conservation_discrepancy_seed_and_source_progress(): void
    {
        $rmId = (string) Str::uuid();
        $sourceId = (string) Str::uuid();
        $sourceLineId = (string) Str::uuid();
        $rmLineId = (string) Str::uuid();

        $ack = $this->seedEvidenceAcknowledgment($rmId, 'po_supplier_dr');
        $input = $this->makePoInput($rmId, 'RM-2026-0002', $sourceId, 'PO-2026-0001', 1, $ack, [
            $this->makePoLine($rmLineId, $sourceLineId, $this->variantPcsId, $this->unitPcsId, 0, 'Chapter Shirt / Medium', '50', '40', '0', '10', '240.00', '10 shirts rejected for misaligned print.'),
        ]);

        $sourceContext = [
            'snapshot' => $input['acknowledgment']['snapshot'],
            'source_status' => 'issued',
            'source_material_version' => 2,
            'lines' => [
                $sourceLineId => [
                    'variant_id' => $this->variantPcsId,
                    'unit_id' => $this->unitPcsId,
                    'unit_valuation_php' => '240.00',
                    'accepted_quantity' => '0',
                    'rejected_or_disputed_quantity' => '0',
                    'outstanding_quantity' => '100',
                ],
            ],
        ];

        $committedAt = CarbonImmutable::parse('2026-11-26T08:40:00.000000Z');
        $result = DB::transaction(fn () => app(PrepareReceivingInventoryParticipant::class)->prepare($input, $sourceContext, $committedAt));

        $this->assertSame('ready', $result['outcome']);
        $this->assertSame(2, $result['stock_version']);
        $this->assertTrue($result['emit_stock_lot_changed_event']);

        $this->assertCount(1, $result['usable_lots']);
        $usableLot = $result['usable_lots'][0];
        $this->assertSame('usable', $usableLot['condition']);
        $this->assertSame('stockroom', $usableLot['custody']);
        $this->assertSame('po_rm', $usableLot['source_kind']);
        $this->assertSame('40', $usableLot['quantity']);
        $this->assertTrue($usableLot['immediately_allocatable']);
        $this->assertSame('unrestricted', $usableLot['restrictions']['state']);

        $this->assertCount(1, $result['quarantined_or_rejected_lots']);
        $rejectedLot = $result['quarantined_or_rejected_lots'][0];
        $this->assertSame('rejected', $rejectedLot['condition']);
        $this->assertSame('10', $rejectedLot['quantity']);
        $this->assertFalse($rejectedLot['immediately_allocatable']);

        $this->assertCount(2, $result['movements']);
        $this->assertSame('accepted_receipt', $result['movements'][0]['kind']);
        $this->assertSame('9600.00', $result['movements'][0]['total_value_php']);
        $this->assertSame('PHP', $result['movements'][0]['currency']);
        $this->assertSame('rejected_receipt', $result['movements'][1]['kind']);
        $this->assertSame('2400.00', $result['movements'][1]['total_value_php']);

        $this->assertCount(1, $result['created_discrepancies']);
        $seed = $result['created_discrepancies'][0];
        $this->assertSame('0', $seed['damaged_quantity']);
        $this->assertSame('10', $seed['rejected_quantity']);
        $this->assertSame('10', $seed['total_discrepant_quantity']);
        $this->assertNull($seed['quarantined_lot_id']);
        $this->assertSame($rejectedLot['lot_id'], $seed['rejected_lot_id']);

        $this->assertSame([
            [
                'source_line_id' => $sourceLineId,
                'accepted_delta' => '40',
                'rejected_or_disputed_delta' => '10',
                'new_accepted_quantity' => '40',
                'new_outstanding_quantity' => '60',
                'new_source_status' => 'partially_received',
            ],
        ], $result['source_line_updates']);

        $this->assertSame(1, InventoryPosting::where('source_id', $rmId)->count());
        $this->assertSame(2, InventoryLot::where('source_id', $rmId)->count());
        $this->assertSame(2, InventoryMovement::where('source_rm_id', $rmId)->count());
        $this->assertTrue((bool) CatalogueUnit::findOrFail($this->unitPcsId)->quantity_identity_locked);
        $this->assertSame(2, (int) ChapterOpeningGuard::findOrFail($this->chapterId)->stock_version);
    }

    public function test_fractional_scale_quarantine_half_up_valuation_replacement_and_receiving_complete(): void
    {
        $sourceId = (string) Str::uuid();
        $sourceLineId = (string) Str::uuid();
        $discrepancyId = (string) Str::uuid();
        $rm1Id = (string) Str::uuid();

        $ack1 = $this->seedEvidenceAcknowledgment($rm1Id, 'po_supplier_dr');
        $input1 = $this->makePoInput($rm1Id, 'RM-2026-0010', $sourceId, 'PO-2026-0010', 1, $ack1, [
            $this->makePoLine((string) Str::uuid(), $sourceLineId, $this->variantKgId, $this->unitKgId, 3, 'Rice Bulk', '2.500', '1.255', '1.245', '0.000', '10.05', '1.245 kg damp bags quarantined.'),
        ]);

        $ctx1 = [
            'snapshot' => $input1['acknowledgment']['snapshot'],
            'source_status' => 'issued',
            'source_material_version' => 2,
            'lines' => [
                $sourceLineId => [
                    'variant_id' => $this->variantKgId,
                    'unit_id' => $this->unitKgId,
                    'unit_valuation_php' => '10.05',
                    'accepted_quantity' => '0.000',
                    'rejected_or_disputed_quantity' => '0.000',
                    'outstanding_quantity' => '3.000',
                ],
            ],
        ];

        $res1 = DB::transaction(fn () => app(PrepareReceivingInventoryParticipant::class)->prepare($input1, $ctx1));
        $this->assertSame('ready', $res1['outcome']);
        $this->assertSame('1.255', $res1['usable_lots'][0]['quantity']);
        $this->assertSame('quarantined', $res1['quarantined_or_rejected_lots'][0]['condition']);
        $this->assertSame('1.245', $res1['quarantined_or_rejected_lots'][0]['quantity']);
        $this->assertFalse($res1['quarantined_or_rejected_lots'][0]['immediately_allocatable']);
        // 1.255 * 10.05 = 12.61275 -> 12.61 half_up; 1.245 * 10.05 = 12.51225 -> 12.51 half_up
        $this->assertSame('12.61', $res1['movements'][0]['total_value_php']);
        $this->assertSame('12.51', $res1['movements'][1]['total_value_php']);
        $this->assertSame($res1['quarantined_or_rejected_lots'][0]['lot_id'], $res1['created_discrepancies'][0]['quarantined_lot_id']);
        $this->assertNull($res1['created_discrepancies'][0]['rejected_lot_id']);
        $this->assertSame('partially_received', $res1['source_line_updates'][0]['new_source_status']);

        // Second replacement PO-RM completes remaining 1.745 kg and resolves open discrepancy.
        $rm2Id = (string) Str::uuid();
        $ack2 = $this->seedEvidenceAcknowledgment($rm2Id, 'po_supplier_dr');
        $input2 = $this->makePoInput($rm2Id, 'RM-2026-0011', $sourceId, 'PO-2026-0010', 2, $ack2, [
            $this->makePoLine((string) Str::uuid(), $sourceLineId, $this->variantKgId, $this->unitKgId, 3, 'Rice Bulk', '1.745', '1.745', '0.000', '0.000', '10.05', null, $discrepancyId),
        ]);

        $ctx2 = [
            'source_status' => 'partially_received',
            'source_material_version' => 2,
            'open_discrepancy_ids' => [$discrepancyId],
            'lines' => [
                $sourceLineId => [
                    'variant_id' => $this->variantKgId,
                    'unit_id' => $this->unitKgId,
                    'unit_valuation_php' => '10.05',
                    'accepted_quantity' => '1.255',
                    'rejected_or_disputed_quantity' => '1.245',
                    'outstanding_quantity' => '1.745',
                ],
            ],
        ];

        $res2 = DB::transaction(fn () => app(PrepareReceivingInventoryParticipant::class)->prepare($input2, ['snapshot' => $input2['acknowledgment']['snapshot']] + $ctx2));
        $this->assertSame('ready', $res2['outcome']);
        $this->assertSame(3, $res2['stock_version']);
        $this->assertSame('receiving_complete', $res2['source_line_updates'][0]['new_source_status']);
        $this->assertSame('0.000', $res2['source_line_updates'][0]['new_outstanding_quantity']);
        $this->assertSame('3.000', $res2['source_line_updates'][0]['new_accepted_quantity']);
    }

    public function test_refencing_rejects_overdelivery_substitution_stale_evidence_setup_and_authority_without_writes(): void
    {
        $sourceId = (string) Str::uuid();
        $sourceLineId = (string) Str::uuid();
        $baseContext = [
            'source_status' => 'partially_received',
            'source_material_version' => 2,
            'lines' => [
                $sourceLineId => [
                    'variant_id' => $this->variantPcsId,
                    'unit_id' => $this->unitPcsId,
                    'unit_valuation_php' => '240.00',
                    'accepted_quantity' => '40',
                    'rejected_or_disputed_quantity' => '10',
                    'outstanding_quantity' => '60',
                ],
            ],
        ];

        // 1. Overdelivery (65 accepted against 60 remaining) -> substitution_or_overdelivery_blocked.
        $rmOver = (string) Str::uuid();
        $ackOver = $this->seedEvidenceAcknowledgment($rmOver, 'po_supplier_dr');
        $baseContext['snapshot'] = $ackOver['snapshot'];
        $res = $this->runParticipant(
            $this->makePoInput($rmOver, 'RM-2026-0099', $sourceId, 'PO-2026-0001', 1, $ackOver, [
                $this->makePoLine((string) Str::uuid(), $sourceLineId, $this->variantPcsId, $this->unitPcsId, 0, 'Chapter Shirt / Medium', '65', '65', '0', '0', '240.00'),
            ]),
            $baseContext
        );
        $this->assertSame(['outcome' => 'rejected', 'reason' => 'substitution_or_overdelivery_blocked'], $res);

        // 2. Variant/unit substitution -> substitution_or_overdelivery_blocked.
        $resSub = $this->runParticipant(
            $this->makePoInput($rmOver, 'RM-2026-0099', $sourceId, 'PO-2026-0001', 1, $ackOver, [
                $this->makePoLine((string) Str::uuid(), $sourceLineId, $this->variantKgId, $this->unitKgId, 3, 'Rice Bulk', '5', '5', '0', '0', '240.00'),
            ]),
            $baseContext
        );
        $this->assertSame(['outcome' => 'rejected', 'reason' => 'substitution_or_overdelivery_blocked'], $resSub);

        // 3. Stale stock_version -> stale_version.
        $resStale = $this->runParticipant(
            $this->makePoInput($rmOver, 'RM-2026-0099', $sourceId, 'PO-2026-0001', 99, $ackOver, [
                $this->makePoLine((string) Str::uuid(), $sourceLineId, $this->variantPcsId, $this->unitPcsId, 0, 'Chapter Shirt / Medium', '10', '10', '0', '0', '240.00'),
            ]),
            $baseContext
        );
        $this->assertSame(['outcome' => 'rejected', 'reason' => 'stale_version'], $resStale);

        // 4. Scale precision overflow (silent rounding blocked) -> source_not_eligible.
        $kgLineId = (string) Str::uuid();
        $resScale = $this->runParticipant(
            $this->makePoInput($rmOver, 'RM-2026-0099', $sourceId, 'PO-2026-0001', 1, $ackOver, [
                $this->makePoLine((string) Str::uuid(), $kgLineId, $this->variantKgId, $this->unitKgId, 3, 'Rice Bulk', '1.2345', '1.2345', '0.000', '0.000', '10.00'),
            ]),
            [
                'snapshot' => $ackOver['snapshot'],
                'source_status' => 'issued',
                'source_material_version' => 2,
                'lines' => [
                    $kgLineId => [
                        'variant_id' => $this->variantKgId,
                        'unit_id' => $this->unitKgId,
                        'unit_valuation_php' => '10.00',
                        'accepted_quantity' => '0',
                        'rejected_or_disputed_quantity' => '0',
                        'outstanding_quantity' => '5.000',
                    ],
                ],
            ]
        );
        $this->assertSame(['outcome' => 'rejected', 'reason' => 'source_not_eligible'], $resScale);

        // 5. Evidence mismatch (non-null recipient_id violates Stage 2 no-recipient rule).
        $badAck = $ackOver;
        $badAck['recipient_id'] = $this->receivingUserId;
        $resEvMismatch = $this->runParticipant(
            $this->makePoInput($rmOver, 'RM-2026-0099', $sourceId, 'PO-2026-0001', 1, $badAck, [
                $this->makePoLine((string) Str::uuid(), $sourceLineId, $this->variantPcsId, $this->unitPcsId, 0, 'Chapter Shirt / Medium', '10', '10', '0', '0', '240.00'),
            ]),
            $baseContext
        );
        $this->assertSame(['outcome' => 'rejected', 'reason' => 'evidence_mismatch'], $resEvMismatch);

        foreach (['material_version' => 2, 'sha256' => str_repeat('a', 64)] as $key => $value) {
            $staleAck = $ackOver;
            $staleAck['snapshot'][$key] = $value;
            $result = $this->runParticipant(
                $this->makePoInput($rmOver, 'RM-2026-0099', $sourceId, 'PO-2026-0001', 1, $staleAck, [
                    $this->makePoLine((string) Str::uuid(), $sourceLineId, $this->variantPcsId, $this->unitPcsId, 0, 'Chapter Shirt / Medium', '10', '10', '0', '0', '240.00'),
                ]),
                $baseContext
            );
            $this->assertSame(['outcome' => 'rejected', 'reason' => 'evidence_mismatch'], $result);
        }

        $this->assertSame(1, (int) ChapterOpeningGuard::where('chapter_id', $this->chapterId)->value('stock_version'));
        $this->assertSame(0, DomainNotificationOutbox::count());

        // 6. Setup blocked (remove valuation_rounding policy).
        PolicyRecord::where('chapter_id', $this->chapterId)->where('policy_code', 'valuation_rounding')->delete();
        $resSetup = $this->runParticipant(
            $this->makePoInput($rmOver, 'RM-2026-0099', $sourceId, 'PO-2026-0001', 1, $ackOver, [
                $this->makePoLine((string) Str::uuid(), $sourceLineId, $this->variantPcsId, $this->unitPcsId, 0, 'Chapter Shirt / Medium', '10', '10', '0', '0', '240.00'),
            ]),
            $baseContext
        );
        $this->assertSame(['outcome' => 'rejected', 'reason' => 'setup_blocked'], $resSetup);

        // 7. Authority changed (revoke RECEIVING duty).
        DutyGrant::where('chapter_id', $this->chapterId)->where('user_id', $this->receivingUserId)->where('duty_code', 'RECEIVING')->delete();
        $resAuth = $this->runParticipant(
            $this->makePoInput($rmOver, 'RM-2026-0099', $sourceId, 'PO-2026-0001', 1, $ackOver, [
                $this->makePoLine((string) Str::uuid(), $sourceLineId, $this->variantPcsId, $this->unitPcsId, 0, 'Chapter Shirt / Medium', '10', '10', '0', '0', '240.00'),
            ]),
            $baseContext
        );
        $this->assertSame(['outcome' => 'rejected', 'reason' => 'authority_changed'], $resAuth);

        $this->assertSame(0, InventoryPosting::count());
        $this->assertSame(0, InventoryLot::count());
        $this->assertSame(0, InventoryMovement::count());
    }

    /** @return array<string, mixed> */
    private function runParticipant(array $input, array $sourceContext): array
    {
        return DB::transaction(fn () => app(PrepareReceivingInventoryParticipant::class)->prepare($input, $sourceContext));
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
            'matched_at' => '2026-11-26T08:25:00.000000Z',
            'recipient_id' => null,
            'acknowledged_at' => '2026-11-26T08:25:00.000000Z',
            'snapshot' => [
                'target' => [
                    'purpose' => $purpose,
                    'record_id' => $rmId,
                ],
                'material_version' => 1,
                'sha256' => hash('sha256', $rmId),
            ],
            'bytes' => [
                'evidence_id' => $evidenceId,
                'version_id' => $versionId,
                'attachments' => [
                    [
                        'attachment_id' => $attachmentId,
                        'sha256' => $sha256,
                    ],
                ],
            ],
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
            'actor_id' => $this->receivingUserId,
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
        string $variantId,
        string $unitId,
        int $scale,
        string $label,
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
            'variant_id' => $variantId,
            'variant_material_version' => 1,
            'item_id' => $this->itemId,
            'unit_id' => $unitId,
            'unit_material_version' => 1,
            'quantity_scale' => $scale,
            'historical_variant_label' => $label,
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
