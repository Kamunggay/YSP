<?php

namespace Tests\Feature\Stage2;

use App\Models\AuditLog;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\ChapterOpeningGuard;
use App\Models\DomainNotificationOutbox;
use App\Models\Donation;
use App\Models\DonationLine;
use App\Models\PolicyRecord;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderLine;
use App\Models\ReceivingDiscrepancy;
use App\Models\Repf;
use App\Models\RepfLine;
use App\Models\User;
use App\Services\Inventory\Participants\ReceivingInventoryParticipant;
use App\Services\Notifications\NotificationSubjectRead;
use App\Services\Shared\CanonicalJson;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\Feature\Stage2\Fixtures\ReceivingInventoryFake;
use Tests\TestCase;

class ReceivingWorkflowTest extends TestCase
{
    use AuthenticatesBrowserOfficer, RefreshDatabase;

    private ReceivingInventoryFake $fakeInventory;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('evidence');
        $this->fakeInventory = new ReceivingInventoryFake;
        $this->app->instance(ReceivingInventoryParticipant::class, $this->fakeInventory);
    }

    public function test_po_partial_receipt_evidence_invalidation_replacement_loop_and_short_close_quarantine_invariant(): void
    {
        [$chapter, $receiver, $purchaser, $head, $location, $variant, $unit, $otherVariant] = $this->scenario();
        $this->valuationPolicy($chapter, $head, 'half_up');
        [$po, $poLine] = $this->seedIssuedPo($chapter, $purchaser, $variant, $unit, '100', '12.50');
        [$draftPo] = $this->seedIssuedPo($chapter, $purchaser, $variant, $unit, '20', '12.50', status: 'draft');
        ChapterOpeningGuard::updateOrCreate(['chapter_id' => $chapter->id], ['stock_version' => 4]);

        $rmUrl = "/api/v1/chapters/{$chapter->id}/receiving-reports";
        $discUrl = "/api/v1/chapters/{$chapter->id}/receiving-discrepancies";

        // Stage 1 /opening-rms remains completely separate; Stage 2 rejects source_kind=ipc with 422
        $this->asBrowserOfficer($receiver->id)->get("/api/v1/chapters/{$chapter->id}/opening-rms")
            ->assertOk();
        $this->write($receiver, $rmUrl, $this->poDraftPayload($po, $poLine, $location->id, ['source_kind' => 'ipc']))
            ->assertUnprocessable()
            ->assertJsonPath('error.fields.0.pointer', '/source_kind');

        // Ineligible PO (draft) -> 409 source_not_eligible
        $this->write($receiver, $rmUrl, $this->poDraftPayload($draftPo, $draftPo->lines->first(), $location->id))
            ->assertConflict()
            ->assertJsonPath('error.code', 'source_not_eligible')
            ->assertJsonPath('failed_intent_committed', false);

        // Missing DR reference on PO -> 422
        $this->write($receiver, $rmUrl, $this->poDraftPayload($po, $poLine, $location->id, [
            'supplier_dr_reference' => null,
            'supplier_dr_date' => null,
        ]))->assertUnprocessable();

        // Variant substitution -> 409 substitution_or_overdelivery_blocked
        $this->write($receiver, $rmUrl, $this->poDraftPayload($po, $poLine, $location->id, [
            'lines' => [[
                'source_line_id' => $poLine->id,
                'variant_id' => $otherVariant->id,
                'unit_id' => $unit->id,
                'delivered_quantity' => '10',
                'accepted_quantity' => '10',
                'damaged_quantity' => '0',
                'rejected_quantity' => '0',
                'unit_valuation_php' => '12.50',
                'discrepancy_notes' => null,
                'resolves_discrepancy_id' => null,
            ]],
        ]))->assertConflict()->assertJsonPath('error.code', 'substitution_or_overdelivery_blocked');

        // Unamended overdelivery (105 > 100) -> 409 substitution_or_overdelivery_blocked
        $this->write($receiver, $rmUrl, $this->poDraftPayload($po, $poLine, $location->id, [
            'lines' => [[
                'source_line_id' => $poLine->id,
                'variant_id' => $variant->id,
                'unit_id' => $unit->id,
                'delivered_quantity' => '105',
                'accepted_quantity' => '105',
                'damaged_quantity' => '0',
                'rejected_quantity' => '0',
                'unit_valuation_php' => '12.50',
                'discrepancy_notes' => null,
                'resolves_discrepancy_id' => null,
            ]],
        ]))->assertConflict()->assertJsonPath('error.code', 'substitution_or_overdelivery_blocked');

        // Unit valuation mismatch & missing discrepancy_notes -> 422
        $this->write($receiver, $rmUrl, $this->poDraftPayload($po, $poLine, $location->id, [
            'lines' => [[
                'source_line_id' => $poLine->id,
                'variant_id' => $variant->id,
                'unit_id' => $unit->id,
                'delivered_quantity' => '50',
                'accepted_quantity' => '40',
                'damaged_quantity' => '0',
                'rejected_quantity' => '10',
                'unit_valuation_php' => '13.00',
                'discrepancy_notes' => '10 units torn',
                'resolves_discrepancy_id' => null,
            ]],
        ]))->assertUnprocessable()->assertJsonPath('error.fields.0.pointer', '/lines/0/unit_valuation_php');

        $this->write($receiver, $rmUrl, $this->poDraftPayload($po, $poLine, $location->id, [
            'lines' => [[
                'source_line_id' => $poLine->id,
                'variant_id' => $variant->id,
                'unit_id' => $unit->id,
                'delivered_quantity' => '50',
                'accepted_quantity' => '40',
                'damaged_quantity' => '0',
                'rejected_quantity' => '10',
                'unit_valuation_php' => '12.50',
                'discrepancy_notes' => null,
                'resolves_discrepancy_id' => null,
            ]],
        ]))->assertUnprocessable()->assertJsonPath('error.fields.0.pointer', '/lines/0/discrepancy_notes');

        // Create PO-RM1: 50 delivered (40 accepted, 10 rejected)
        $rm1LineInput = [
            'source_line_id' => $poLine->id,
            'variant_id' => $variant->id,
            'unit_id' => $unit->id,
            'delivered_quantity' => '50',
            'accepted_quantity' => '40',
            'damaged_quantity' => '0',
            'rejected_quantity' => '10',
            'unit_valuation_php' => '12.50',
            'discrepancy_notes' => '10 rejected <script>alert(1)</script> water stains',
            'resolves_discrepancy_id' => null,
        ];
        $createKey = (string) Str::uuid();
        $created = $this->write($receiver, $rmUrl, $this->poDraftPayload($po, $poLine, $location->id, [
            'lines' => [$rm1LineInput],
        ]), $createKey)->assertCreated();
        $created->assertHeader('X-Action-Replayed', 'false')
            ->assertJsonPath('data.status_code', 201)
            ->assertJsonPath('data.posting', null)
            ->assertJsonPath('data.result.status', 'draft')
            ->assertJsonPath('data.result.accepted_total_value_php', '500.00');
        $rm1Id = $created->json('data.result.id');
        $createOpId = $created->json('data.operation_id');

        // Exact X-Action-Key replay vs conflict
        $this->write($receiver, $rmUrl, $this->poDraftPayload($po, $poLine, $location->id, [
            'lines' => [$rm1LineInput],
        ]), $createKey)->assertCreated()->assertHeader('X-Action-Replayed', 'true')
            ->assertJsonPath('data.operation_id', $createOpId);

        $this->write($receiver, $rmUrl, $this->poDraftPayload($po, $poLine, $location->id, [
            'supplier_dr_reference' => 'DR-CHANGED',
            'lines' => [$rm1LineInput],
        ]), $createKey)->assertConflict()->assertJsonPath('error.code', 'action_key_conflict');

        // Inspect RM1 -> freezes ReceivingReportEvidenceMaterial snapshot
        $inspectedAt = '2026-11-28T01:00:00.000000Z';
        $inspected = $this->write($receiver, "$rmUrl/$rm1Id/inspection", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'source_material_version' => 1,
            'technical_or_requesting_representative_id' => $purchaser->id,
            'inspected_at' => $inspectedAt,
            'inspection_notes' => 'Checked box seals and counts.',
            'lines' => [$rm1LineInput],
        ])->assertOk();
        $inspected->assertJsonPath('data.result.status', 'inspected')
            ->assertJsonPath('data.result.version', 2)
            ->assertJsonPath('data.result.material_version', 1)
            ->assertJsonPath('data.result.inspection.technical_or_requesting_representative.user_id', $purchaser->id);
        $snap1 = $inspected->json('data.result.snapshot.sha256');
        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $snap1);

        // Upload po_supplier_dr PDF and match evidence
        $paper1 = $this->uploadEvidence($chapter, $receiver, 'po_supplier_dr', $rm1Id);
        $matched = $this->write($receiver, "$rmUrl/$rm1Id/evidence-match", [
            'expected_version' => 2,
            'expected_material_version' => 1,
            'snapshot_sha256' => $snap1,
            'evidence' => $paper1,
            'acknowledged_at' => '2026-11-28T01:05:00.000000Z',
        ])->assertOk();
        $matched->assertJsonPath('data.result.status', 'evidence_matched')
            ->assertJsonPath('data.result.version', 3);

        // Replace evidence_matched RM -> bumps material_version=2, resets to draft, invalidates evidence binding
        $replaced = $this->putWrite($receiver, "$rmUrl/$rm1Id", [
            'expected_version' => 3,
            'expected_material_version' => 1,
            'source_material_version' => 1,
            'supplier_dr_reference' => 'DR-2026-001-REV',
            'supplier_dr_date' => '2026-11-28',
            'location_id' => $location->id,
            'lines' => [$rm1LineInput],
        ])->assertOk();
        $replaced->assertJsonPath('data.result.status', 'draft')
            ->assertJsonPath('data.result.version', 4)
            ->assertJsonPath('data.result.material_version', 2)
            ->assertJsonPath('data.result.inspection', null)
            ->assertJsonPath('data.result.snapshot', null)
            ->assertJsonPath('data.result.evidence_acknowledgment', null);

        // Re-inspect and re-match at material_version=2
        $inspected2 = $this->write($receiver, "$rmUrl/$rm1Id/inspection", [
            'expected_version' => 4,
            'expected_material_version' => 2,
            'source_material_version' => 1,
            'technical_or_requesting_representative_id' => $purchaser->id,
            'inspected_at' => $inspectedAt,
            'inspection_notes' => 'Re-inspected after DR reference fix.',
            'lines' => [$rm1LineInput],
        ])->assertOk();
        $snap2 = $inspected2->json('data.result.snapshot.sha256');
        $this->assertNotSame($snap1, $snap2);

        // Stale snapshot hash rejected with 409 evidence_mismatch
        $this->write($receiver, "$rmUrl/$rm1Id/evidence-match", [
            'expected_version' => 5,
            'expected_material_version' => 2,
            'snapshot_sha256' => $snap1,
            'evidence' => $paper1,
            'acknowledged_at' => '2026-11-28T01:10:00.000000Z',
        ])->assertConflict()->assertJsonPath('error.code', 'evidence_mismatch');

        $matched2 = $this->write($receiver, "$rmUrl/$rm1Id/evidence-match", [
            'expected_version' => 5,
            'expected_material_version' => 2,
            'snapshot_sha256' => $snap2,
            'evidence' => $paper1,
            'acknowledged_at' => '2026-11-28T01:10:00.000000Z',
        ])->assertOk();
        $ack2Id = $matched2->json('data.result.evidence_acknowledgment.acknowledgment_id');

        // Posting without RM reference_series policy -> 409 setup_blocked
        $this->write($receiver, "$rmUrl/$rm1Id/post", [
            'expected_version' => 6,
            'expected_material_version' => 2,
            'source_material_version' => 1,
            'acknowledgment_id' => $ack2Id,
        ])->assertConflict()
            ->assertJsonPath('error.code', 'setup_blocked')
            ->assertJsonPath('setup_blockers.0.setting_key', 'reference_series');

        // Seed RM reference_series policy and post RM1
        $this->rmSeriesPolicy($chapter, $head);
        $posted = $this->write($receiver, "$rmUrl/$rm1Id/post", [
            'expected_version' => 6,
            'expected_material_version' => 2,
            'source_material_version' => 1,
            'acknowledgment_id' => $ack2Id,
        ])->assertOk();
        $posted->assertJsonPath('data.result.status', 'posted')
            ->assertJsonPath('data.result.posting_stock_version', 5)
            ->assertJsonPath('data.posting.stock_version', 5)
            ->assertJsonPath('data.posting.source_status_after', 'partially_received');
        $rm1Ref = $posted->json('data.result.rm_reference');
        $this->assertStringStartsWith('SYNRM-', $rm1Ref);
        $this->assertCount(1, $posted->json('data.posting.usable_lot_ids'));
        $this->assertCount(1, $posted->json('data.posting.quarantined_or_rejected_lot_ids'));
        $discrepancyId = $posted->json('data.posting.created_discrepancy_ids.0');
        $this->assertNotEmpty($discrepancyId);
        $this->assertSame(5, (int) ChapterOpeningGuard::findOrFail($chapter->id)->stock_version);
        $this->assertSame(4, $this->fakeInventory->calls[0]['current_stock_version']);

        // PO progress: 100 ordered -> 40 accepted, 10 rejected_or_disputed, 60 outstanding
        $po->refresh();
        $poLine->refresh();
        $this->assertSame('partially_received', $po->status);
        $this->assertSame('40.000000', (string) $poLine->accepted_quantity);
        $this->assertSame('10.000000', (string) $poLine->rejected_or_disputed_quantity);
        $this->assertSame('60.000000', (string) $poLine->outstanding_quantity);

        // Posted RM is immutable (cannot replace or cancel)
        $this->write($receiver, "$rmUrl/$rm1Id/cancel", [
            'expected_version' => 7,
            'expected_material_version' => 2,
            'reason' => 'Too late',
        ])->assertConflict()->assertJsonPath('error.code', 'invalid_transition');

        // Sub-endpoints: movements, discrepancies, history, versions, related, escaped print
        $this->asBrowserOfficer($receiver->id)->get("$rmUrl/$rm1Id/movements")->assertOk()
            ->assertJsonCount(2, 'data');
        $this->asBrowserOfficer($receiver->id)->get("$rmUrl/$rm1Id/discrepancies")->assertOk()
            ->assertJsonPath('data.0.id', $discrepancyId)
            ->assertJsonPath('data.0.quarantined_lots_auto_cleared_on_source_close', false);
        $history = $this->asBrowserOfficer($receiver->id)->get("$rmUrl/$rm1Id/history")->assertOk()->json('data');
        $this->assertCount(7, $history);
        $this->assertTrue(collect($history)->contains(fn ($entry) => $entry['action'] === 'draft_replaced' && $entry['evidence_binding_invalidated'] === true));
        $this->asBrowserOfficer($receiver->id)->get("$rmUrl/$rm1Id/versions/1")->assertOk()
            ->assertJsonPath('data.status', 'draft');
        $relatedKinds = collect($this->asBrowserOfficer($receiver->id)->get("$rmUrl/$rm1Id/related")->assertOk()->json('data'))
            ->pluck('kind')->unique()->values()->all();
        $this->assertContains('purchase_order', $relatedKinds);
        $this->assertContains('stock_lot', $relatedKinds);
        $this->assertContains('receiving_discrepancy', $relatedKinds);

        $print = $this->asBrowserOfficer($receiver->id)->get("$rmUrl/$rm1Id/print")->assertOk();
        $print->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        $this->assertStringContainsString('&lt;script&gt;alert(1)&lt;/script&gt;', $print->getContent());
        $this->assertStringNotContainsString('<script>alert(1)</script>', $print->getContent());
        $this->assertStringNotContainsString('/evidence/', $print->getContent());

        // Discrepancy state machine: open -> supplier_notified -> under_review -> resolved (via replacement PO-RM2)
        $this->write($purchaser, "$discUrl/$discrepancyId/notify-supplier", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'supplier_contact_reference' => 'SUP-CASE-99',
            'notification_notes' => 'Requested 10 replacement units.',
            'expected_resolution_date' => '2026-12-05',
        ])->assertOk()->assertJsonPath('data.result.status', 'supplier_notified');

        $this->write($purchaser, "$discUrl/$discrepancyId/resolutions", [
            'action' => 'start_review',
            'expected_version' => 2,
            'expected_material_version' => 1,
            'review_notes' => 'Awaiting supplier replacement DR.',
        ])->assertOk()->assertJsonPath('data.result.status', 'under_review');

        // Replacement PO-RM2: overdelivery 61 > 60 blocked; 60 accepted succeeds and completes PO
        $this->write($receiver, $rmUrl, $this->poDraftPayload($po, $poLine, $location->id, [
            'lines' => [[
                'source_line_id' => $poLine->id,
                'variant_id' => $variant->id,
                'unit_id' => $unit->id,
                'delivered_quantity' => '61',
                'accepted_quantity' => '61',
                'damaged_quantity' => '0',
                'rejected_quantity' => '0',
                'unit_valuation_php' => '12.50',
                'discrepancy_notes' => null,
                'resolves_discrepancy_id' => $discrepancyId,
            ]],
        ]))->assertConflict()->assertJsonPath('error.code', 'substitution_or_overdelivery_blocked');

        $rm2LineInput = [
            'source_line_id' => $poLine->id,
            'variant_id' => $variant->id,
            'unit_id' => $unit->id,
            'delivered_quantity' => '60',
            'accepted_quantity' => '60',
            'damaged_quantity' => '0',
            'rejected_quantity' => '0',
            'unit_valuation_php' => '12.50',
            'discrepancy_notes' => null,
            'resolves_discrepancy_id' => $discrepancyId,
        ];
        $rm2Id = $this->write($receiver, $rmUrl, $this->poDraftPayload($po, $poLine, $location->id, [
            'supplier_dr_reference' => 'DR-2026-002-REPL',
            'lines' => [$rm2LineInput],
        ]))->assertCreated()->json('data.result.id');

        $rm2Snap = $this->write($receiver, "$rmUrl/$rm2Id/inspection", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'source_material_version' => 1,
            'technical_or_requesting_representative_id' => null,
            'inspected_at' => '2026-11-28T02:00:00.000000Z',
            'inspection_notes' => 'Replacement and remaining balance complete.',
            'lines' => [$rm2LineInput],
        ])->assertOk()->json('data.result.snapshot.sha256');
        $rm2Paper = $this->uploadEvidence($chapter, $receiver, 'po_supplier_dr', $rm2Id);
        $rm2Ack = $this->write($receiver, "$rmUrl/$rm2Id/evidence-match", [
            'expected_version' => 2,
            'expected_material_version' => 1,
            'snapshot_sha256' => $rm2Snap,
            'evidence' => $rm2Paper,
            'acknowledged_at' => '2026-11-28T02:05:00.000000Z',
        ])->assertOk()->json('data.result.evidence_acknowledgment.acknowledgment_id');

        $rm2Posted = $this->write($receiver, "$rmUrl/$rm2Id/post", [
            'expected_version' => 3,
            'expected_material_version' => 1,
            'source_material_version' => 1,
            'acknowledgment_id' => $rm2Ack,
        ])->assertOk();
        $rm2Posted->assertJsonPath('data.posting.source_status_after', 'receiving_complete');
        $rm2Ref = $rm2Posted->json('data.result.rm_reference');
        $this->assertNotSame($rm1Ref, $rm2Ref);
        $this->assertSame('receiving_complete', $po->fresh()->status);

        // Resolve discrepancy referencing replacement RM2 with signed receiving_discrepancy paper
        $discPaper = $this->uploadEvidence($chapter, $receiver, 'receiving_discrepancy', $discrepancyId);
        $this->write($receiver, "$discUrl/$discrepancyId/resolutions", [
            'action' => 'resolve',
            'expected_version' => 3,
            'expected_material_version' => 1,
            'resolution_kind' => 'supplier_replacement_received',
            'reason' => 'Supplier replaced 10 rejected units via RM2.',
            'replacement_rm_id' => $rm2Id,
            'quarantined_lot_disposition' => 'returned_to_supplier_physically',
            'evidence' => $discPaper,
            'signed_at' => '2026-11-28T02:10:00.000000Z',
        ])->assertOk()
            ->assertJsonPath('data.result.status', 'resolved')
            ->assertJsonPath('data.result.resolution.replacement_rm_reference', $rm2Ref)
            ->assertJsonPath('data.result.quarantined_lots_auto_cleared_on_source_close', false);

        // Post-resolution mutation -> 409 discrepancy_already_resolved
        $this->write($purchaser, "$discUrl/$discrepancyId/notify-supplier", [
            'expected_version' => 4,
            'expected_material_version' => 2,
            'supplier_contact_reference' => 'DUP',
            'notification_notes' => 'Already closed',
            'expected_resolution_date' => null,
        ])->assertConflict()->assertJsonPath('error.code', 'discrepancy_already_resolved');

        // Replacement RM's /discrepancies includes the resolved discrepancy
        $this->asBrowserOfficer($receiver->id)->get("$rmUrl/$rm2Id/discrepancies")->assertOk()
            ->assertJsonPath('data.0.id', $discrepancyId);

        // Short-closing a PO with an open discrepancy keeps discrepancy open and quarantined_lots_auto_cleared_on_source_close=false
        [$poShort, $poShortLine] = $this->seedIssuedPo($chapter, $purchaser, $variant, $unit, '20', '10.00');
        $shortRmId = $this->postSimpleRm($chapter, $receiver, $poShort, $poShortLine, $location->id, 'po', '10', '5', '5', '0', '10.00', '5 damaged in transit');
        $shortDisc = ReceivingDiscrepancy::where('rm_id', $shortRmId)->firstOrFail();
        $closeShort = $this->write($head, "/api/v1/chapters/{$chapter->id}/purchase-orders/{$poShort->id}/close-short", [
            'expected_version' => (int) $poShort->fresh()->version,
            'expected_material_version' => (int) $poShort->fresh()->material_version,
            'reason' => 'Supplier unable to fulfill remaining 15 units.',
        ]);
        $this->assertSame(200, $closeShort->status(), $closeShort->getContent());
        $closeShort->assertJsonPath('data.result.status', 'closed_short');

        $this->asBrowserOfficer($receiver->id)->get("$discUrl/{$shortDisc->id}")->assertOk()
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.quarantined_lots_auto_cleared_on_source_close', false);
    }

    public function test_da_rm_mixed_restrictions_zero_acceptance_da_discrepancy_and_unposted_cancel(): void
    {
        [$chapter, $receiver, $purchaser, $head, $location, $variant, $unit] = $this->scenario();
        $this->valuationPolicy($chapter, $head, 'half_up');
        $this->rmSeriesPolicy($chapter, $head);
        $this->daAuthPolicy($chapter, $head);

        $uninterpreted = [
            'state' => 'uninterpreted',
            'allowed_uses' => [],
            'event_ids' => [],
            'requesting_unit_ids' => [],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => null,
            'source_condition_reference' => 'Donor letter para 4 requires review',
        ];
        $bounded = [
            'state' => 'bounded',
            'allowed_uses' => ['internal_use'],
            'event_ids' => [],
            'requesting_unit_ids' => [],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => (string) Str::uuid(),
            'source_condition_reference' => 'Donor letter para 2 internal only',
        ];
        [$da, $daLine1, $daLine2] = $this->seedAcknowledgedDa($chapter, $receiver, $variant, $unit, $uninterpreted, $bounded);
        $rmUrl = "/api/v1/chapters/{$chapter->id}/receiving-reports";
        $discUrl = "/api/v1/chapters/{$chapter->id}/receiving-discrepancies";

        // Zero-acceptance DA-RM1 (2 delivered, 0 accepted, 2 damaged) -> retains DA status 'acknowledged' while counting as posted!
        $rm1Id = $this->postSimpleRm($chapter, $receiver, $da, $daLine1, $location->id, 'da', '2', '0', '2', '0', '25.00', '2 water-damaged on arrival');
        $this->assertSame('acknowledged', $da->fresh()->status);

        // Because zero-acceptance DA-RM1 posted, cancelDonation is now blocked!
        $this->write($receiver, "/api/v1/chapters/{$chapter->id}/donations/{$da->id}/cancel", [
            'expected_version' => (int) $da->fresh()->version,
            'expected_material_version' => (int) $da->fresh()->material_version,
            'reason' => 'Should be blocked after zero-acceptance DA-RM.',
        ])->assertConflict()->assertJsonPath('error.code', 'invalid_transition');

        // DA discrepancy: notify-supplier blocked with 409 source_not_eligible
        $daDisc = ReceivingDiscrepancy::where('rm_id', $rm1Id)->firstOrFail();
        $this->write($purchaser, "$discUrl/{$daDisc->id}/notify-supplier", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'supplier_contact_reference' => 'N/A',
            'notification_notes' => 'Should fail for DA',
            'expected_resolution_date' => null,
        ])->assertConflict()->assertJsonPath('error.code', 'source_not_eligible');

        // Resolve DA discrepancy via start_review -> resolve (donated_declined_or_disposed)
        $this->write($receiver, "$discUrl/{$daDisc->id}/resolutions", [
            'action' => 'start_review',
            'expected_version' => 1,
            'expected_material_version' => 1,
            'review_notes' => 'Inspecting damaged donated goods.',
        ])->assertOk()->assertJsonPath('data.result.status', 'under_review');

        $daDiscPaper = $this->uploadEvidence($chapter, $receiver, 'receiving_discrepancy', $daDisc->id);
        $this->write($receiver, "$discUrl/{$daDisc->id}/resolutions", [
            'action' => 'resolve',
            'expected_version' => 2,
            'expected_material_version' => 1,
            'resolution_kind' => 'donated_declined_or_disposed',
            'reason' => 'Disposed per chapter policy.',
            'replacement_rm_id' => null,
            'quarantined_lot_disposition' => 'disposed_per_policy',
            'evidence' => $daDiscPaper,
            'signed_at' => '2026-11-28T03:00:00.000000Z',
        ])->assertOk()->assertJsonPath('data.result.status', 'resolved');

        // Full acceptance DA-RM2 carrying mixed restrictions -> DA becomes 'received'
        $daLines = [
            [
                'source_line_id' => $daLine1->id,
                'variant_id' => $variant->id,
                'unit_id' => $unit->id,
                'delivered_quantity' => '10',
                'accepted_quantity' => '10',
                'damaged_quantity' => '0',
                'rejected_quantity' => '0',
                'unit_valuation_php' => '25.00',
                'discrepancy_notes' => null,
                'resolves_discrepancy_id' => null,
            ],
            [
                'source_line_id' => $daLine2->id,
                'variant_id' => $variant->id,
                'unit_id' => $unit->id,
                'delivered_quantity' => '20',
                'accepted_quantity' => '20',
                'damaged_quantity' => '0',
                'rejected_quantity' => '0',
                'unit_valuation_php' => '15.00',
                'discrepancy_notes' => null,
                'resolves_discrepancy_id' => null,
            ],
        ];
        $rm2Id = $this->write($receiver, $rmUrl, [
            'source_kind' => 'da',
            'source_id' => $da->id,
            'source_material_version' => 1,
            'originating_hold_id' => null,
            'supplier_dr_reference' => null,
            'supplier_dr_date' => null,
            'location_id' => $location->id,
            'lines' => $daLines,
        ])->assertCreated()->json('data.result.id');
        $snap = $this->write($receiver, "$rmUrl/$rm2Id/inspection", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'source_material_version' => 1,
            'technical_or_requesting_representative_id' => null,
            'inspected_at' => '2026-11-28T03:10:00.000000Z',
            'inspection_notes' => 'All donated units verified.',
            'lines' => $daLines,
        ])->assertOk()->json('data.result.snapshot.sha256');
        $daPaper = $this->uploadEvidence($chapter, $receiver, 'da_receipt', $rm2Id);
        $daAck = $this->write($receiver, "$rmUrl/$rm2Id/evidence-match", [
            'expected_version' => 2,
            'expected_material_version' => 1,
            'snapshot_sha256' => $snap,
            'evidence' => $daPaper,
            'acknowledged_at' => '2026-11-28T03:12:00.000000Z',
        ])->assertOk()->json('data.result.evidence_acknowledgment.acknowledgment_id');

        $this->write($receiver, "$rmUrl/$rm2Id/post", [
            'expected_version' => 3,
            'expected_material_version' => 1,
            'source_material_version' => 1,
            'acknowledgment_id' => $daAck,
        ])->assertOk()->assertJsonPath('data.posting.source_status_after', 'received');

        $this->assertSame('received', $da->fresh()->status);
        $movements = $this->asBrowserOfficer($receiver->id)->get("$rmUrl/$rm2Id/movements")->assertOk()->json('data');
        $this->assertCount(2, $movements);
        $byLine = collect($movements)->keyBy('source_line_id');
        $this->assertSame('uninterpreted', $byLine[$daLine1->id]['restrictions']['state']);
        $this->assertFalse($byLine[$daLine1->id]['immediately_allocatable']);
        $this->assertSame('bounded', $byLine[$daLine2->id]['restrictions']['state']);
        $this->assertTrue($byLine[$daLine2->id]['immediately_allocatable']);

        // Unposted RM cancel allocates no reference and posts zero movements
        [$po, $poLine] = $this->seedIssuedPo($chapter, $purchaser, $variant, $unit, '15', '10.00');
        $draftId = $this->write($receiver, $rmUrl, $this->poDraftPayload($po, $poLine, $location->id, [
            'lines' => [[
                'source_line_id' => $poLine->id,
                'variant_id' => $variant->id,
                'unit_id' => $unit->id,
                'delivered_quantity' => '5',
                'accepted_quantity' => '5',
                'damaged_quantity' => '0',
                'rejected_quantity' => '0',
                'unit_valuation_php' => '10.00',
                'discrepancy_notes' => null,
                'resolves_discrepancy_id' => null,
            ]],
        ]))->assertCreated()->json('data.result.id');

        $this->write($receiver, "$rmUrl/$draftId/cancel", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'reason' => 'Entered against wrong delivery truck.',
        ])->assertOk()
            ->assertJsonPath('data.result.status', 'canceled')
            ->assertJsonPath('data.result.rm_reference', null)
            ->assertJsonPath('data.result.cancel_reason', 'Entered against wrong delivery truck.');
        $this->asBrowserOfficer($receiver->id)->get("$rmUrl/$draftId/movements")->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_missing_source_holds_search_q_recovery_and_outbox_subject_read_parity(): void
    {
        [$chapter, $receiver, $purchaser, $head, $location, $variant, $unit] = $this->scenario();
        $this->valuationPolicy($chapter, $head, 'half_up');
        $this->rmSeriesPolicy($chapter, $head);
        [$po, $poLine] = $this->seedIssuedPo($chapter, $purchaser, $variant, $unit, '30', '20.00');

        $holdUrl = "/api/v1/chapters/{$chapter->id}/receiving-holds";
        $rmUrl = "/api/v1/chapters/{$chapter->id}/receiving-reports";
        $discUrl = "/api/v1/chapters/{$chapter->id}/receiving-discrepancies";
        $opsUrl = "/api/v1/chapters/{$chapter->id}/receiving-operations";

        // Create missing-source hold 1
        $hold1Key = (string) Str::uuid();
        $hold1 = $this->write($receiver, $holdUrl, [
            'arrived_at' => '2026-11-28T04:00:00.000000Z',
            'holding_location_id' => $location->id,
            'carrier_or_sender_name' => 'Alpha Logistics Express',
            'sender_kind' => 'carrier',
            'delivery_document_reference' => 'WAYBILL-ALPHA-01',
            'hold_reason' => 'Arrived without PO or DR paperwork.',
            'items' => [[
                'variant_id' => $variant->id,
                'unit_id' => $unit->id,
                'item_description' => 'Blue T-Shirt Boxes',
                'arrived_quantity' => '10',
                'condition_notes' => 'Cartons intact in holding cage.',
            ]],
            'intake_evidence' => null,
        ], $hold1Key)->assertCreated();
        $hold1->assertJsonPath('data.result.status', 'held')
            ->assertJsonPath('data.result.usable_stock_posted', false)
            ->assertJsonPath('data.result.ipc_creation_prohibited', true);
        $hold1Id = $hold1->json('data.result.id');
        $hold1OpId = $hold1->json('data.operation_id');
        $this->assertDatabaseCount('inventory_lots', 0);
        $this->assertDatabaseCount('inventory_movements', 0);

        // Linking to IPC rejected with 422
        $this->write($receiver, "$holdUrl/$hold1Id/link-source", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'source_kind' => 'ipc',
            'source_id' => (string) Str::uuid(),
            'supplier_dr_reference' => null,
            'supplier_dr_date' => null,
            'link_notes' => 'Attempt forbidden IPC link.',
        ])->assertUnprocessable()->assertJsonPath('error.fields.0.pointer', '/source_kind');

        // Link hold 1 to verified issued PO + DR
        $this->write($receiver, "$holdUrl/$hold1Id/link-source", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'source_kind' => 'po',
            'source_id' => $po->id,
            'supplier_dr_reference' => 'DR-LINKED-01',
            'supplier_dr_date' => '2026-11-28',
            'link_notes' => 'Verified against PO and supplier DR.',
        ])->assertOk()
            ->assertJsonPath('data.result.status', 'linked_to_source')
            ->assertJsonPath('data.result.usable_stock_posted', false)
            ->assertJsonPath('data.result.ipc_creation_prohibited', true)
            ->assertJsonPath('data.result.linked_source.source_reference', $po->po_reference);

        // Post-resolution mutation on hold 1 -> 409 hold_already_resolved
        $this->write($receiver, "$holdUrl/$hold1Id/link-source", [
            'expected_version' => 2,
            'expected_material_version' => 2,
            'source_kind' => 'po',
            'source_id' => $po->id,
            'supplier_dr_reference' => 'DR-LINKED-02',
            'supplier_dr_date' => '2026-11-28',
            'link_notes' => 'Duplicate link attempt.',
        ])->assertConflict()->assertJsonPath('error.code', 'hold_already_resolved');

        // Create PO-RM originating from linked hold 1
        $rmFromHold = $this->write($receiver, $rmUrl, $this->poDraftPayload($po, $poLine, $location->id, [
            'originating_hold_id' => $hold1Id,
            'supplier_dr_reference' => 'DR-LINKED-01',
            'lines' => [[
                'source_line_id' => $poLine->id,
                'variant_id' => $variant->id,
                'unit_id' => $unit->id,
                'delivered_quantity' => '10',
                'accepted_quantity' => '8',
                'damaged_quantity' => '2',
                'rejected_quantity' => '0',
                'unit_valuation_php' => '20.00',
                'discrepancy_notes' => '2 cartons dented during hold transfer',
                'resolves_discrepancy_id' => null,
            ]],
        ]))->assertCreated();
        $rmFromHoldId = $rmFromHold->json('data.result.id');
        $this->assertSame($hold1Id, $rmFromHold->json('data.result.originating_hold_id'));
        $relatedHoldKinds = collect($this->asBrowserOfficer($receiver->id)->get("$rmUrl/$rmFromHoldId/related")->assertOk()->json('data'))
            ->pluck('kind')->all();
        $this->assertContains('receiving_hold', $relatedHoldKinds);

        // Create missing-source hold 2 and reject-return with signed missing_source_hold paper
        $hold2Id = $this->write($receiver, $holdUrl, [
            'arrived_at' => '2026-11-28T05:00:00.000000Z',
            'holding_location_id' => $location->id,
            'carrier_or_sender_name' => 'Omega Unknown Courier',
            'sender_kind' => 'unknown',
            'delivery_document_reference' => null,
            'hold_reason' => 'Unrecognized sender parcel.',
            'items' => [[
                'variant_id' => null,
                'unit_id' => null,
                'item_description' => 'Unlabeled Mystery Crate',
                'arrived_quantity' => '1',
                'condition_notes' => 'Sealed wooden crate.',
            ]],
            'intake_evidence' => null,
        ])->assertCreated()->json('data.result.id');

        $hold2Paper = $this->uploadEvidence($chapter, $receiver, 'missing_source_hold', $hold2Id);
        $this->write($receiver, "$holdUrl/$hold2Id/reject-return", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'reason' => 'Refused and returned to courier after 24h without source.',
            'recipient_or_carrier_name' => 'Omega Driver #4',
            'evidence' => $hold2Paper,
            'signed_at' => '2026-11-28T05:30:00.000000Z',
        ])->assertOk()
            ->assertJsonPath('data.result.status', 'rejected_returned')
            ->assertJsonPath('data.result.usable_stock_posted', false)
            ->assertJsonPath('data.result.ipc_creation_prohibited', true);

        $this->asBrowserOfficer($receiver->id)->get("$holdUrl/$hold2Id/history")->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.action', 'rejected_returned')
            ->assertJsonPath('data.1.action', 'held');

        // v0.5.1 q search & eligible_for filters across holds, reports, discrepancies
        $this->asBrowserOfficer($receiver->id)->get("$holdUrl?q=Alpha+Logistics")->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $hold1Id);
        $this->asBrowserOfficer($receiver->id)->get("$holdUrl?eligible_for=receiving_draft")->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $hold1Id);
        $this->asBrowserOfficer($receiver->id)->get("$rmUrl?q=DR-LINKED-01")->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $rmFromHoldId);

        // Post RM from hold to create a discrepancy and test q search on discrepancies + outbox parity
        $this->postSimpleRm($chapter, $receiver, $po, $poLine, $location->id, 'po', '10', '8', '2', '0', '20.00', 'UniqueNeedleDiscrepancyNote');
        $this->asBrowserOfficer($receiver->id)->get("$discUrl?q=UniqueNeedleDiscrepancyNote")->assertOk()
            ->assertJsonCount(1, 'data');

        // Recovery via /receiving-operations/by-key and /{operation_id}: original actor allowed, other actor uniform 404
        $this->asBrowserOfficer($receiver->id)->get("$opsUrl/by-key?operation_name=createReceivingHold&action_key=$hold1Key")
            ->assertOk()
            ->assertJsonPath('data.operation_id', $hold1OpId)
            ->assertJsonPath('data.resource_kind', 'receiving_hold');
        $this->asBrowserOfficer($receiver->id)->get("$opsUrl/$hold1OpId")
            ->assertOk()
            ->assertJsonPath('data.operation_id', $hold1OpId);
        $this->asBrowserOfficer($purchaser->id)->get("$opsUrl/$hold1OpId")
            ->assertNotFound()
            ->assertJsonPath('error.code', 'operation_not_found');

        // Outbox & NotificationSubjectRead::allows() parity across all emitted Stage 2 receiving + co-emitted events
        $subjectRead = app(NotificationSubjectRead::class);
        $salesOnly = $this->officer($chapter, ['SALES_OFFICER']);
        $events = DomainNotificationOutbox::where('chapter_id', $chapter->id)->get();
        $eventNames = $events->pluck('event_name')->unique()->all();
        $this->assertContains('stage2.receiving-report.changed.v1', $eventNames);
        $this->assertContains('stage2.receiving-discrepancy.changed.v1', $eventNames);
        $this->assertContains('stage2.receiving-hold.changed.v1', $eventNames);
        $this->assertContains('stage2.purchase-order.changed.v1', $eventNames);
        $this->assertContains('stage1.stock-lot.changed.v1', $eventNames);

        foreach ($events as $event) {
            if ($event->event_name === 'stage1.stock-lot.changed.v1') {
                continue; // StockLot detail read is owned by Stage 1 stock.read; check Stage 2 subjects below
            }
            $this->assertTrue($subjectRead->allows($receiver, $event), "Receiver should read {$event->event_name}");
            $this->assertFalse($subjectRead->allows($salesOnly, $event), "Sales-only user must not read {$event->event_name}");
        }
    }

    private function postSimpleRm(
        Chapter $chapter,
        User $receiver,
        PurchaseOrder|Donation $source,
        PurchaseOrderLine|DonationLine $sourceLine,
        string $locationId,
        string $sourceKind,
        string $delivered,
        string $accepted,
        string $damaged,
        string $rejected,
        string $unitPhp,
        ?string $notes,
    ): string {
        $rmUrl = "/api/v1/chapters/{$chapter->id}/receiving-reports";
        $line = [
            'source_line_id' => $sourceLine->id,
            'variant_id' => $sourceLine->variant_id,
            'unit_id' => $sourceLine->unit_id,
            'delivered_quantity' => $delivered,
            'accepted_quantity' => $accepted,
            'damaged_quantity' => $damaged,
            'rejected_quantity' => $rejected,
            'unit_valuation_php' => $unitPhp,
            'discrepancy_notes' => $notes,
            'resolves_discrepancy_id' => null,
        ];
        $rmId = $this->write($receiver, $rmUrl, [
            'source_kind' => $sourceKind,
            'source_id' => $source->id,
            'source_material_version' => (int) $source->material_version,
            'originating_hold_id' => null,
            'supplier_dr_reference' => $sourceKind === 'po' ? 'DR-'.substr((string) Str::uuid(), 0, 8) : null,
            'supplier_dr_date' => $sourceKind === 'po' ? '2026-11-28' : null,
            'location_id' => $locationId,
            'lines' => [$line],
        ])->assertCreated()->json('data.result.id');

        $snap = $this->write($receiver, "$rmUrl/$rmId/inspection", [
            'expected_version' => 1,
            'expected_material_version' => 1,
            'source_material_version' => (int) $source->material_version,
            'technical_or_requesting_representative_id' => null,
            'inspected_at' => '2026-11-28T06:00:00.000000Z',
            'inspection_notes' => 'Inspected delivery.',
            'lines' => [$line],
        ])->assertOk()->json('data.result.snapshot.sha256');

        $paper = $this->uploadEvidence($chapter, $receiver, $sourceKind === 'po' ? 'po_supplier_dr' : 'da_receipt', $rmId);
        $ack = $this->write($receiver, "$rmUrl/$rmId/evidence-match", [
            'expected_version' => 2,
            'expected_material_version' => 1,
            'snapshot_sha256' => $snap,
            'evidence' => $paper,
            'acknowledged_at' => '2026-11-28T06:05:00.000000Z',
        ])->assertOk()->json('data.result.evidence_acknowledgment.acknowledgment_id');

        $this->write($receiver, "$rmUrl/$rmId/post", [
            'expected_version' => 3,
            'expected_material_version' => 1,
            'source_material_version' => (int) $source->material_version,
            'acknowledgment_id' => $ack,
        ])->assertOk();

        return $rmId;
    }

    /** @return array{Chapter, User, User, User, CatalogueLocation, CatalogueVariant, CatalogueUnit, CatalogueVariant} */
    private function scenario(): array
    {
        $chapter = Chapter::create([
            'id' => (string) Str::uuid(),
            'code' => 'SYN-RCV',
            'name' => 'Receiving Chapter',
            'status' => 'live',
            'version' => 1,
        ]);
        $receiver = $this->officer($chapter, ['RECEIVING', 'INVENTORY']);
        $purchaser = $this->officer($chapter, ['PURCHASING']);
        $head = $this->officer($chapter, ['CHAPTER_HEAD', 'BUDGET_APPROVER', 'FINANCE']);

        $location = CatalogueLocation::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapter->id,
            'code' => 'STK-MAIN',
            'name' => 'Main Stockroom',
            'state' => 'active',
            'material_version' => 1,
        ]);
        $unit = CatalogueUnit::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapter->id,
            'code' => 'PCS',
            'name' => 'Pieces',
            'quantity_kind' => 'counted',
            'quantity_scale' => 0,
            'state' => 'active',
            'material_version' => 1,
        ]);
        $item = CatalogueItem::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapter->id,
            'code' => 'SHIRT',
            'name' => 'Chapter Shirt',
            'unit_id' => $unit->id,
            'state' => 'active',
            'is_active' => true,
            'material_version' => 1,
        ]);
        $variant = CatalogueVariant::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapter->id,
            'item_id' => $item->id,
            'unit_id' => $unit->id,
            'code' => 'SHIRT-M',
            'sku' => 'SHIRT-M',
            'name' => 'Medium Shirt',
            'label' => 'Medium Shirt',
            'quantity_scale' => 0,
            'state' => 'active',
            'is_active' => true,
            'material_version' => 1,
        ]);
        $otherVariant = CatalogueVariant::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapter->id,
            'item_id' => $item->id,
            'unit_id' => $unit->id,
            'code' => 'SHIRT-L',
            'sku' => 'SHIRT-L',
            'name' => 'Large Shirt',
            'label' => 'Large Shirt',
            'quantity_scale' => 0,
            'state' => 'active',
            'is_active' => true,
            'material_version' => 1,
        ]);

        return [$chapter, $receiver, $purchaser, $head, $location, $variant, $unit, $otherVariant];
    }

    /** @return array{PurchaseOrder, PurchaseOrderLine} */
    private function seedIssuedPo(Chapter $chapter, User $purchaser, CatalogueVariant $variant, CatalogueUnit $unit, string $qty, string $unitPhp, string $status = 'issued'): array
    {
        $selectionId = (string) Str::uuid();
        $repf = Repf::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapter->id,
            'status' => 'ordered',
            'version' => 1,
            'material_version' => 1,
            'repf_reference' => 'SYNREPF-'.substr((string) Str::uuid(), 0, 8),
            'prepared_by' => $purchaser->id,
            'estimated_total_php' => '2000.00',
            'approved_budget_php' => '2000.00',
            'supplier_selection_json' => [
                'selections' => [
                    $selectionId => [
                        'id' => $selectionId,
                        'material_version' => 1,
                    ],
                ],
            ],
        ]);
        $repfLine = RepfLine::create([
            'id' => (string) Str::uuid(),
            'repf_id' => $repf->id,
            'line_number' => 1,
            'trigger_kind' => 'min_stock',
            'item_id' => $variant->item_id,
            'variant_id' => $variant->id,
            'unit_id' => $unit->id,
            'quantity_scale' => 0,
            'requested_quantity' => $qty,
            'ordered_quantity' => $qty,
            'remaining_to_order_quantity' => '0',
            'estimated_unit_cost_php' => $unitPhp,
            'estimated_line_total_php' => number_format((float) $qty * (float) $unitPhp, 2, '.', ''),
            'net_need_breakdown' => [],
        ]);
        $po = PurchaseOrder::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapter->id,
            'status' => $status,
            'version' => 1,
            'material_version' => 1,
            'repf_id' => $repf->id,
            'supplier_selection_id' => $selectionId,
            'po_reference' => $status === 'draft' ? null : 'SYNPO-'.substr((string) Str::uuid(), 0, 8),
            'prepared_by' => $purchaser->id,
            'supplier' => [
                'supplier_name' => 'Metro Supplies Co.',
                'supplier_subtype' => 'local_vendor',
                'contact_reference' => 'metro@example.invalid',
                'supplier_reference' => 'SUP-1',
            ],
            'delivery_location' => 'Main Stockroom',
            'expected_delivery_date' => '2026-12-01',
            'payment_and_delivery_terms' => 'Net 15',
            'total_amount_php' => number_format((float) $qty * (float) $unitPhp, 2, '.', ''),
            'issued_at' => $status === 'draft' ? null : now('UTC'),
        ]);
        $poLine = PurchaseOrderLine::create([
            'id' => (string) Str::uuid(),
            'po_id' => $po->id,
            'repf_id' => $repf->id,
            'repf_line_id' => $repfLine->id,
            'variant_id' => $variant->id,
            'unit_id' => $unit->id,
            'quantity_scale' => 0,
            'ordered_quantity' => $qty,
            'accepted_quantity' => '0',
            'rejected_or_disputed_quantity' => '0',
            'closed_short_quantity' => '0',
            'canceled_quantity' => '0',
            'outstanding_quantity' => $qty,
            'unit_price_php' => $unitPhp,
            'line_total_php' => number_format((float) $qty * (float) $unitPhp, 2, '.', ''),
            'specifications' => 'Medium chapter shirts',
        ]);
        $po->load('lines');

        return [$po, $poLine];
    }

    /** @return array{Donation, DonationLine, DonationLine} */
    private function seedAcknowledgedDa(Chapter $chapter, User $preparer, CatalogueVariant $variant, CatalogueUnit $unit, array $r1, array $r2): array
    {
        $da = Donation::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapter->id,
            'status' => 'acknowledged',
            'version' => 1,
            'material_version' => 1,
            'reference' => 'SYNDA-'.substr((string) Str::uuid(), 0, 8),
            'prepared_by' => $preparer->id,
            'donor_name' => 'Generous Alumni Association',
            'valuation_policy_id' => (string) Str::uuid(),
            'valuation_policy_version' => 1,
            'valuation_policy' => ['rounding_mode' => 'half_up'],
            'pledged_total_value_php' => '550.00',
        ]);
        $line1 = DonationLine::create([
            'id' => (string) Str::uuid(),
            'da_id' => $da->id,
            'line_number' => 1,
            'variant_id' => $variant->id,
            'unit_id' => $unit->id,
            'quantity_scale' => 0,
            'pledged_quantity' => '10',
            'received_quantity' => '0',
            'closed_short_quantity' => '0',
            'outstanding_quantity' => '10',
            'unit_value_php' => '25.00',
            'pledged_value_php' => '250.00',
            'valuation_kind' => 'declared',
            'valuation_basis' => 'Donor receipt',
            'condition_notes' => 'New',
            'initial_restrictions' => $r1,
            'restrictions' => $r1,
        ]);
        $line2 = DonationLine::create([
            'id' => (string) Str::uuid(),
            'da_id' => $da->id,
            'line_number' => 2,
            'variant_id' => $variant->id,
            'unit_id' => $unit->id,
            'quantity_scale' => 0,
            'pledged_quantity' => '20',
            'received_quantity' => '0',
            'closed_short_quantity' => '0',
            'outstanding_quantity' => '20',
            'unit_value_php' => '15.00',
            'pledged_value_php' => '300.00',
            'valuation_kind' => 'estimated',
            'valuation_basis' => 'Market reference',
            'condition_notes' => 'New',
            'initial_restrictions' => $r2,
            'restrictions' => $r2,
        ]);

        return [$da, $line1, $line2];
    }

    private function poDraftPayload(PurchaseOrder $po, PurchaseOrderLine $line, string $locationId, array $overrides = []): array
    {
        return array_merge([
            'source_kind' => 'po',
            'source_id' => $po->id,
            'source_material_version' => (int) $po->material_version,
            'originating_hold_id' => null,
            'supplier_dr_reference' => 'DR-2026-001',
            'supplier_dr_date' => '2026-11-28',
            'location_id' => $locationId,
            'lines' => [[
                'source_line_id' => $line->id,
                'variant_id' => $line->variant_id,
                'unit_id' => $line->unit_id,
                'delivered_quantity' => '10',
                'accepted_quantity' => '10',
                'damaged_quantity' => '0',
                'rejected_quantity' => '0',
                'unit_valuation_php' => (string) $line->unit_price_php,
                'discrepancy_notes' => null,
                'resolves_discrepancy_id' => null,
            ]],
        ], $overrides);
    }

    private function valuationPolicy(Chapter $chapter, User $approver, string $mode): PolicyRecord
    {
        return $this->seedPolicy($chapter, $approver, 'valuation_rounding', 'FINANCE', 'OpeningValuationPolicyValue', [
            'currency' => 'PHP',
            'decimal_places' => 2,
            'rounding_mode' => $mode,
        ]);
    }

    private function rmSeriesPolicy(Chapter $chapter, User $approver): PolicyRecord
    {
        return $this->seedPolicy($chapter, $approver, 'reference_series', 'CHAPTER_HEAD', 'OpeningReferencePolicyValue', [
            'ipc_prefix' => 'SYNIPC',
            'rm_prefix' => 'SYNRM',
            'minimum_digits' => 4,
            'reset_yearly' => true,
        ]);
    }

    private function daAuthPolicy(Chapter $chapter, User $approver): PolicyRecord
    {
        return $this->seedPolicy($chapter, $approver, 'da_authorization', 'CHAPTER_HEAD', 'DaAuthorizationPolicyValue', [
            'acknowledge_duties' => ['CHAPTER_HEAD', 'FINANCE'],
            'restriction_resolve_duties' => ['CHAPTER_HEAD', 'FINANCE'],
            'require_preparer_independence' => true,
        ]);
    }

    private function seedPolicy(Chapter $chapter, User $approver, string $code, string $owner, string $schema, array $rules): PolicyRecord
    {
        $id = (string) Str::uuid();
        $policy = PolicyRecord::create([
            'id' => $id,
            'chapter_id' => $chapter->id,
            'aggregate_id' => $id,
            'policy_code' => $code,
            'policy_version' => 1,
            'rules_json' => $rules,
            'effective_from' => now('UTC')->subMinute(),
            'effective_until' => null,
        ]);
        AuditLog::create([
            'chapter_id' => $chapter->id,
            'user_id' => $approver->id,
            'action' => 'controlled:recordPolicy',
            'entity_type' => 'policy',
            'entity_id' => $id,
            'details' => [
                'version' => 1,
                'subject_id' => null,
                'value_schema_reference' => '#/components/schemas/'.$schema,
                'value_sha256' => CanonicalJson::sha256($rules),
                'approvals' => [['authority' => $owner, 'approver_id' => $approver->id]],
            ],
        ]);

        return $policy;
    }

    private function uploadEvidence(Chapter $chapter, User $actor, string $purpose, string $recordId): array
    {
        $pdf = $this->validPaperPdf();
        $uploaded = $this->sendRawMultipartPaper(
            "/api/v1/chapters/{$chapter->id}/evidence",
            $actor->id,
            (string) Str::uuid(),
            ['purpose' => $purpose, 'record_id' => $recordId],
            [['filename' => 'signed.pdf', 'media_type' => 'application/pdf', 'bytes' => $pdf]],
        )->assertCreated()->json('data');

        return [
            'evidence_id' => $uploaded['evidence_id'],
            'version_id' => $uploaded['version_id'],
            'attachments' => [[
                'attachment_id' => $uploaded['attachments'][0]['attachment_id'],
                'sha256' => hash('sha256', $pdf),
            ]],
        ];
    }

    private function officer(Chapter $chapter, array $duties): User
    {
        $id = (string) Str::uuid();
        $user = User::create([
            'id' => $id,
            'name' => 'Officer '.substr($id, 0, 6),
            'public_id' => "rcv-{$id}@example.invalid",
            'email' => "rcv-{$id}@example.invalid",
            'password_hash' => Hash::make('Synthetic test credential'),
            'status' => 'active',
            'version' => 1,
        ]);
        $user->memberships()->create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapter->id,
            'membership_status' => 'active',
            'version' => 1,
        ]);
        foreach ($duties as $duty) {
            $user->dutyGrants()->create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $chapter->id,
                'duty_code' => $duty,
                'status' => 'active',
                'is_alternate' => false,
                'scope' => in_array($duty, ['CHAPTER_HEAD', 'BUDGET_APPROVER'], true) ? ['limit_php' => '100000.00'] : null,
                'valid_from' => now()->subDay(),
                'version' => 1,
            ]);
        }

        return $user;
    }

    private function write(User $actor, string $url, array $payload, ?string $actionKey = null): TestResponse
    {
        return $this->asBrowserOfficer($actor->id, $actionKey ?? (string) Str::uuid())
            ->postJson($url, $payload);
    }

    private function putWrite(User $actor, string $url, array $payload, ?string $actionKey = null): TestResponse
    {
        return $this->asBrowserOfficer($actor->id, $actionKey ?? (string) Str::uuid())
            ->putJson($url, $payload);
    }
}
