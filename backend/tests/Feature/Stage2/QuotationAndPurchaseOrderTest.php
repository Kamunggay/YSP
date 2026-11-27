<?php

namespace Tests\Feature\Stage2;

use App\Models\AuditLog;
use App\Models\CatalogueItem;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\DomainNotificationOutbox;
use App\Models\PolicyRecord;
use App\Models\PurchaseOrderLine;
use App\Models\Repf;
use App\Models\RepfLine;
use App\Models\Stage2RecordHistory;
use App\Models\User;
use App\Services\Inventory\Participants\NetShortageSnapshotParticipant;
use App\Services\Notifications\NotificationSubjectRead;
use App\Services\Shared\CanonicalJson;
use Brick\Math\BigDecimal;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\Feature\Stage2\Fixtures\RepfShortageSnapshot;
use Tests\TestCase;

class QuotationAndPurchaseOrderTest extends TestCase
{
    use AuthenticatesBrowserOfficer, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('evidence');
    }

    public function test_quotations_and_policy_gated_supplier_selection_enforce_tiers_waivers_evidence_and_history(): void
    {
        $ctx = $this->setupProcurementContext();
        $chapter = $ctx['chapter'];
        $base = "/api/v1/chapters/{$chapter->id}";
        $purchasing = $ctx['purchasing']; // PURCHASING + INVENTORY (has evidence.read & evidence.prepare)
        $purchasingOnly = $this->officer($chapter, ['PURCHASING']);
        $repf = $ctx['repf'];
        $repfLine = $ctx['repf_line'];
        $quotesUrl = "$base/repfs/{$repf->id}/quotations";

        // Draft RepF rejects quotations with 409 source_not_eligible.
        $draftRepf = $this->createRepfRow($chapter, $ctx['repf_preparer'], $ctx['variant'], $ctx['unit'], 'draft', null);
        $this->postWrite($purchasing, "$base/repfs/{$draftRepf['repf']->id}/quotations", $this->quotePayload($draftRepf['line'], '100.00', '10.00'))
            ->assertConflict()->assertJsonPath('error.code', 'source_not_eligible');

        // Validation: invalid supplier_subtype and blank nullable strings return 422.
        $badSubtype = $this->quotePayload($repfLine, '40.00', '240.00');
        $badSubtype['supplier']['supplier_subtype'] = 'unknown_kind';
        $this->postWrite($purchasing, $quotesUrl, $badSubtype)
            ->assertUnprocessable()->assertJsonPath('error.fields.0.pointer', '/supplier/supplier_subtype');

        $blankValidUntil = $this->quotePayload($repfLine, '40.00', '240.00');
        $blankValidUntil['valid_until'] = '   ';
        $this->postWrite($purchasing, $quotesUrl, $blankValidUntil)
            ->assertUnprocessable()->assertJsonPath('error.fields.0.pointer', '/valid_until');

        $badDate = $this->quotePayload($repfLine, '40.00', '240.00');
        $badDate['valid_until'] = '2026-02-31';
        $this->postWrite($purchasing, $quotesUrl, $badDate)
            ->assertUnprocessable()->assertJsonPath('error.fields.0.pointer', '/valid_until');

        // Upload quotation_attachment paper evidence bound to RepF.
        $pdf = $this->validPaperPdf();
        $uploaded = $this->sendRawMultipartPaper(
            "$base/evidence", $purchasing->id, (string) Str::uuid(),
            ['purpose' => 'quotation_attachment', 'record_id' => $repf->id],
            [['filename' => 'quote.pdf', 'media_type' => 'application/pdf', 'bytes' => $pdf]],
        )->assertCreated()->json('data');
        $binding = [
            'evidence_id' => $uploaded['evidence_id'],
            'version_id' => $uploaded['version_id'],
            'attachments' => [['attachment_id' => $uploaded['attachments'][0]['attachment_id'], 'sha256' => hash('sha256', $pdf)]],
        ];

        // Bad digest fails checkEvidenceBinding with 409 evidence_mismatch.
        $badEv = $this->quotePayload($repfLine, '40.00', '240.00', array_replace_recursive($binding, [
            'attachments' => [['attachment_id' => $uploaded['attachments'][0]['attachment_id'], 'sha256' => str_repeat('b', 64)]],
        ]));
        $this->postWrite($purchasing, $quotesUrl, $badEv)->assertConflict()->assertJsonPath('error.code', 'evidence_mismatch');

        // Create Quote 1 (PHP 9,600.00 with verified evidence) and Quote 2 (PHP 9,800.00) and Quote 3 (duplicate to delete).
        $q1Key = (string) Str::uuid();
        $q1Resp = $this->postWrite($purchasing, $quotesUrl, $this->quotePayload($repfLine, '40.00', '240.00', $binding, 'Visayas Apparel Wholesalers'), $q1Key)
            ->assertCreated()->assertHeader('X-Action-Replayed', 'false');
        $q1Resp->assertJsonPath('data.resource_kind', 'quotation')
            ->assertJsonPath('data.result.total_amount_php', '9600.00')
            ->assertJsonPath('data.result.evidence_binding.evidence_id', $uploaded['evidence_id']);
        $q1Id = $q1Resp->json('data.resource_id');

        $q2Resp = $this->postWrite($purchasing, $quotesUrl, $this->quotePayload($repfLine, '40.00', '245.00', null, 'Mandaue Print Cooperative'))
            ->assertCreated();
        $q2Id = $q2Resp->json('data.resource_id');

        $q3Resp = $this->postWrite($purchasing, $quotesUrl, $this->quotePayload($repfLine, '40.00', '260.00', null, 'Duplicate Vendor'))
            ->assertCreated();
        $q3Id = $q3Resp->json('data.resource_id');

        // Replace unselected Quote 2 -> bumps version and material_version to 2.
        $replaceBody = ['expected_version' => 1, 'expected_material_version' => 1]
            + $this->quotePayload($repfLine, '40.00', '242.50', null, 'Mandaue Print Cooperative');
        $this->asBrowserOfficer($purchasing->id, (string) Str::uuid())->putJson("$quotesUrl/$q2Id", $replaceBody)
            ->assertOk()->assertJsonPath('data.committed_version', 2)->assertJsonPath('data.committed_material_version', 2)
            ->assertJsonPath('data.result.total_amount_php', '9700.00');

        // Bodyless DELETE on unselected Quote 3 + exact replay after deletion.
        $delKey = (string) Str::uuid();
        $delUrl = "$quotesUrl/$q3Id?expected_version=1&expected_material_version=1";
        $delResp = $this->asBrowserOfficer($purchasing->id, $delKey)->delete($delUrl, [], ['Accept' => 'application/json'])
            ->assertOk()->assertHeader('X-Action-Replayed', 'false')
            ->assertJsonPath('data.resource_kind', 'quotation_deletion')
            ->assertJsonPath('data.result.deleted', true);
        $this->asBrowserOfficer($purchasing->id, $delKey)->delete($delUrl, [], ['Accept' => 'application/json'])
            ->assertOk()->assertHeader('X-Action-Replayed', 'true')
            ->assertExactJson($delResp->json());

        // List quotations: q search, ordering, evidence redaction for caller without evidence.read.
        $this->asBrowserOfficer($purchasing->id)->get("$quotesUrl?q=visayas")
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $q1Id)
            ->assertJsonPath('data.0.evidence_binding.evidence_id', $uploaded['evidence_id']);
        $this->asBrowserOfficer($purchasingOnly->id)->get("$quotesUrl?eligible_for=supplier_selection")
            ->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', $q1Id)
            ->assertJsonPath('data.0.evidence_binding', null)
            ->assertJsonPath('data.1.id', $q2Id);
        $this->asBrowserOfficer($purchasing->id)->get("$quotesUrl?eligible_for=purchase_order")
            ->assertOk()->assertJsonCount(0, 'data');

        // Non-version-bumping history appended & stage2.repf.changed.v1 emitted at parent RepF's current version.
        $this->assertSame(1, $repf->fresh()->version);
        $this->assertSame(5, Stage2RecordHistory::where('record_kind', 'repf')->where('record_id', $repf->id)
            ->where('is_version_snapshot', false)->count());
        $this->asBrowserOfficer($purchasing->id)->get("$base/repfs/{$repf->id}/history")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.action', 'approveRepf');
        $repfEvents = DomainNotificationOutbox::where('chapter_id', $chapter->id)->where('event_name', 'stage2.repf.changed.v1')->get();
        $this->assertCount(5, $repfEvents);
        $this->assertSame(5, $repfEvents->pluck('id')->unique()->count());
        $this->assertTrue($repfEvents->every(fn ($e) => $e->resource_version === 1 && $e->material_version === 1));

        // Supplier selection: missing purchasing_quotation_policy -> 409 setup_blocked.
        $selUrl = "$base/repfs/{$repf->id}/supplier-selection";
        $this->postWrite($purchasing, $selUrl, [
            'expected_repf_version' => 1, 'expected_repf_material_version' => 1,
            'selected_quotation_id' => $q1Id, 'comparable_quotation_ids' => [$q1Id, $q2Id],
            'selection_rationale' => 'Lowest price', 'emergency_waiver' => null,
        ])->assertConflict()->assertJsonPath('error.code', 'setup_blocked')
            ->assertJsonPath('setup_blockers.0.setting_key', 'purchasing_quotation_policy');

        // Install purchasing_quotation_policy: 0..10000 needs 2 quotes; >10000 needs 3 quotes; waiver permitted (min 1, CHAPTER_HEAD only).
        $this->installQuotationPolicy($chapter, $ctx['head'], ['CHAPTER_HEAD'], waiverPermitted: true);

        // Single quote without waiver -> 409 quotation_policy_unmet carrying policy_evaluation.
        $this->postWrite($purchasing, $selUrl, [
            'expected_repf_version' => 1, 'expected_repf_material_version' => 1,
            'selected_quotation_id' => $q1Id, 'comparable_quotation_ids' => [$q1Id],
            'selection_rationale' => 'Single quote', 'emergency_waiver' => null,
        ])->assertConflict()->assertJsonPath('error.code', 'quotation_policy_unmet')
            ->assertJsonPath('policy_evaluation.required_minimum_quotes', 2)
            ->assertJsonPath('policy_evaluation.comparable_quote_count', 1);

        // Compliant selection with 2 quotes -> 201 and marks Quote 1 selected.
        $selResp = $this->postWrite($purchasing, $selUrl, [
            'expected_repf_version' => 1, 'expected_repf_material_version' => 1,
            'selected_quotation_id' => $q1Id, 'comparable_quotation_ids' => [$q1Id, $q2Id],
            'selection_rationale' => 'Best price and 5-day lead time.', 'emergency_waiver' => null,
        ])->assertCreated()->assertJsonPath('data.resource_kind', 'supplier_selection')
            ->assertJsonPath('data.result.emergency_waiver_used', false);

        // eligible_for=purchase_order now returns Quote 1; replacing or deleting selected Quote 1 fails with 409 invalid_transition.
        $this->asBrowserOfficer($purchasing->id)->get("$quotesUrl?eligible_for=purchase_order")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $q1Id)->assertJsonPath('data.0.is_selected', true);
        $this->asBrowserOfficer($purchasing->id, (string) Str::uuid())->putJson("$quotesUrl/$q1Id", [
            'expected_version' => 2, 'expected_material_version' => 1,
        ] + $this->quotePayload($repfLine, '40.00', '230.00'))
            ->assertConflict()->assertJsonPath('error.code', 'invalid_transition');
        $this->asBrowserOfficer($purchasing->id, (string) Str::uuid())
            ->delete("$quotesUrl/$q1Id?expected_version=2&expected_material_version=1", [], ['Accept' => 'application/json'])
            ->assertConflict()->assertJsonPath('error.code', 'invalid_transition');

        // Recover createRepfQuotation and recordSupplierSelection receipts via /procurement-operations/*.
        $this->asBrowserOfficer($purchasing->id)->get("$base/procurement-operations/by-key?operation_name=createRepfQuotation&action_key=$q1Key")
            ->assertOk()->assertExactJson($q1Resp->json());
        $this->asBrowserOfficer($purchasing->id)->get("$base/procurement-operations/{$selResp->json('data.operation_id')}")
            ->assertOk()->assertExactJson($selResp->json());
    }

    public function test_purchase_order_lifecycle_independence_ceilings_waivers_acknowledgment_amendments_close_short_cancel_and_recovery(): void
    {
        $ctx = $this->setupProcurementContext(approvedBudget: '9900.00', requestedQty: '100.00');
        $chapter = $ctx['chapter'];
        $base = "/api/v1/chapters/{$chapter->id}";
        $repfPreparer = $ctx['repf_preparer']; // INVENTORY + BUDGET_APPROVER (to test originating RepF preparer independence!)
        $purchasing = $ctx['purchasing']; // PURCHASING + INVENTORY (+ BUDGET_APPROVER for self-approval denial test)
        $purchasing->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => 'BUDGET_APPROVER', 'scope' => ['limit_php' => '50000.00']]);
        $repfPreparer->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => 'BUDGET_APPROVER', 'scope' => ['limit_php' => '50000.00']]);
        $lowApprover = $this->officer($chapter, ['BUDGET_APPROVER'], '5000.00');
        $budgetApprover = $this->officer($chapter, ['BUDGET_APPROVER', 'INVENTORY'], '50000.00');
        $chapterHead = $ctx['head']; // CHAPTER_HEAD + INVENTORY with 50000.00 limit
        $repf = $ctx['repf'];
        $repfLine = $ctx['repf_line'];

        $this->installQuotationPolicy($chapter, $chapterHead, ['CHAPTER_HEAD'], waiverPermitted: true);

        // Record 2 comparable quotes (PHP 9,600.00 & PHP 9,800.00 for 80 units @ 120/122.50) + select Quote 1.
        $q1 = $this->postWrite($purchasing, "$base/repfs/{$repf->id}/quotations", $this->quotePayload($repfLine, '80.00', '120.00', null, 'Cebu Relief <script>x</script>'))->assertCreated()->json('data.result');
        $q2 = $this->postWrite($purchasing, "$base/repfs/{$repf->id}/quotations", $this->quotePayload($repfLine, '80.00', '122.50', null, 'Second Supplier'))->assertCreated()->json('data.result');
        $sel = $this->postWrite($purchasing, "$base/repfs/{$repf->id}/supplier-selection", [
            'expected_repf_version' => 1, 'expected_repf_material_version' => 1,
            'selected_quotation_id' => $q1['id'], 'comparable_quotation_ids' => [$q1['id'], $q2['id']],
            'selection_rationale' => 'Lower unit cost.', 'emergency_waiver' => null,
        ])->assertCreated()->json('data.result');

        // Draft PO exceeding approved RepF budget (9,900.00) while within tier 1 (<=10,000.00) -> 409 budget_limit_exceeded.
        $poUrl = "$base/purchase-orders";
        $overBudget = $this->poPayload($repf->id, $sel['id'], $repfLine->id, $q1['lines'][0]['id'], $ctx['variant']->id, $ctx['unit']->id, '80.00', '124.00');
        $this->postWrite($purchasing, $poUrl, $overBudget)->assertConflict()->assertJsonPath('error.code', 'budget_limit_exceeded');

        // Create compliant PO draft (80 units @ 120.00 = 9,600.00) + replay check + conflict check.
        $createKey = (string) Str::uuid();
        $poBody = $this->poPayload($repf->id, $sel['id'], $repfLine->id, $q1['lines'][0]['id'], $ctx['variant']->id, $ctx['unit']->id, '80.00', '120.00');
        $poDraft = $this->postWrite($purchasing, $poUrl, $poBody, $createKey)->assertCreated()->assertHeader('X-Action-Replayed', 'false');
        $poId = $poDraft->json('data.resource_id');
        $this->postWrite($purchasing, $poUrl, $poBody, $createKey)->assertCreated()->assertHeader('X-Action-Replayed', 'true')
            ->assertExactJson($poDraft->json());
        $this->postWrite($purchasing, $poUrl, array_replace($poBody, ['delivery_location' => 'Other Gate']), $createKey)
            ->assertConflict()->assertJsonPath('error.code', 'action_key_conflict');

        // Submit -> Return (independent approver) -> Replace (returned_for_revision -> draft, bumps material_version) -> Resubmit.
        $this->postWrite($purchasing, "$poUrl/$poId/submit", ['expected_version' => 1, 'expected_material_version' => 1])
            ->assertOk()->assertJsonPath('data.result.status', 'pending_approval');
        $this->postWrite($budgetApprover, "$poUrl/$poId/return", ['expected_version' => 2, 'expected_material_version' => 1, 'reason' => 'Clarify receiving gate.'])
            ->assertOk()->assertJsonPath('data.result.status', 'returned_for_revision');
        $replacePo = ['expected_version' => 3, 'expected_material_version' => 1, 'delivery_location' => 'Cebu Stockroom Gate 2',
            'expected_delivery_date' => '2026-12-05', 'payment_and_delivery_terms' => 'Net 15 days', 'lines' => $poBody['lines']];
        $this->asBrowserOfficer($purchasing->id, (string) Str::uuid())->putJson("$poUrl/$poId", $replacePo)
            ->assertOk()->assertJsonPath('data.result.status', 'draft')->assertJsonPath('data.result.material_version', 2);
        $this->postWrite($purchasing, "$poUrl/$poId/submit", ['expected_version' => 4, 'expected_material_version' => 2])
            ->assertOk()->assertJsonPath('data.result.status', 'pending_approval');

        // Independence & ceiling denials on approvePurchaseOrder:
        // 1) PO preparer cannot approve -> 403 independence_required.
        $this->postWrite($purchasing, "$poUrl/$poId/approve", ['expected_version' => 5, 'expected_material_version' => 2, 'approval_notes' => null])
            ->assertForbidden()->assertJsonPath('error.code', 'independence_required');
        // 2) Originating RepF preparer cannot approve -> 403 independence_required.
        $this->postWrite($repfPreparer, "$poUrl/$poId/approve", ['expected_version' => 5, 'expected_material_version' => 2, 'approval_notes' => null])
            ->assertForbidden()->assertJsonPath('error.code', 'independence_required');
        // 3) Grant ceiling exceeded -> 403 duty_limit_exceeded.
        $this->postWrite($lowApprover, "$poUrl/$poId/approve", ['expected_version' => 5, 'expected_material_version' => 2, 'approval_notes' => null])
            ->assertForbidden()->assertJsonPath('error.code', 'duty_limit_exceeded');
        // 4) Missing PO reference_series -> 409 setup_blocked.
        $this->postWrite($budgetApprover, "$poUrl/$poId/approve", ['expected_version' => 5, 'expected_material_version' => 2, 'approval_notes' => null])
            ->assertConflict()->assertJsonPath('error.code', 'setup_blocked')->assertJsonPath('setup_blockers.0.setting_key', 'reference_series');

        // Install PO reference series -> Approve & Issue atomically!
        $this->installPoSeries($chapter, $chapterHead);
        $approveKey = (string) Str::uuid();
        $issued = $this->postWrite($budgetApprover, "$poUrl/$poId/approve", [
            'expected_version' => 5, 'expected_material_version' => 2, 'approval_notes' => 'Approved within budget.',
        ], $approveKey)->assertOk();
        $expectedRef = 'PO-'.now('Asia/Manila')->year.'-000001';
        $issued->assertJsonPath('data.result.status', 'issued')
            ->assertJsonPath('data.result.po_reference', $expectedRef)
            ->assertJsonPath('data.result.lines.0.ordered_quantity', '80.00')
            ->assertJsonPath('data.result.lines.0.outstanding_quantity', '80.00');

        // Originating RepF progressed atomically to partially_ordered (80 ordered, 20 remaining) & zero usable stock created!
        $repf->refresh();
        $repfLine->refresh();
        $this->assertSame('partially_ordered', $repf->status);
        $this->assertSame('80.00', (string) BigDecimal::of($repfLine->ordered_quantity)->toScale(2));
        $this->assertSame('20.00', (string) BigDecimal::of($repfLine->remaining_to_order_quantity)->toScale(2));
        $this->assertDatabaseCount('inventory_lots', 0);
        $this->assertDatabaseCount('inventory_movements', 0);

        // Outbox & NotificationSubjectRead parity for both PO and RepF events.
        $poEvent = DomainNotificationOutbox::where('chapter_id', $chapter->id)
            ->where('event_name', 'stage2.purchase-order.changed.v1')->latest('committed_at')->firstOrFail();
        $this->assertTrue(app(NotificationSubjectRead::class)->allows($budgetApprover, $poEvent));
        $this->assertFalse(app(NotificationSubjectRead::class)->allows($this->officer($chapter, ['SALES_OFFICER']), $poEvent));

        // Optional non-blocking supplier acknowledgment with verified quotation_attachment bound to {po_id} bumps version only.
        $ackPdf = $this->validPaperPdf();
        $ackEv = $this->sendRawMultipartPaper(
            "$base/evidence", $purchasing->id, (string) Str::uuid(),
            ['purpose' => 'quotation_attachment', 'record_id' => $poId],
            [['filename' => 'ack.pdf', 'media_type' => 'application/pdf', 'bytes' => $ackPdf]],
        )->assertCreated()->json('data');
        $ackBinding = [
            'evidence_id' => $ackEv['evidence_id'], 'version_id' => $ackEv['version_id'],
            'attachments' => [['attachment_id' => $ackEv['attachments'][0]['attachment_id'], 'sha256' => hash('sha256', $ackPdf)]],
        ];
        $this->postWrite($purchasing, "$poUrl/$poId/acknowledgment", [
            'expected_version' => 6, 'expected_material_version' => 2,
            'supplier_confirmation_reference' => 'CONF-88', 'acknowledged_at' => '2026-11-26T05:00:00.000000Z',
            'revised_expected_delivery_date' => '2026-12-07', 'notes' => 'Afternoon delivery.',
            'evidence' => $ackBinding,
        ])->assertOk()->assertJsonPath('data.committed_version', 7)->assertJsonPath('data.committed_material_version', 2)
            ->assertJsonPath('data.result.acknowledgment.evidence_binding.evidence_id', $ackEv['evidence_id']);

        // Simulate partial receiving (40 accepted, 10 rejected/disputed, 40 outstanding) to verify amendment & cancel guards.
        $poLine = PurchaseOrderLine::where('po_id', $poId)->firstOrFail();
        DB::table('purchase_orders')->where('id', $poId)->update(['status' => 'partially_received']);
        DB::table('purchase_order_lines')->where('id', $poLine->id)->update([
            'accepted_quantity' => '40.00', 'rejected_or_disputed_quantity' => '10.00', 'outstanding_quantity' => '40.00',
        ]);

        // Cancel with accepted_quantity > 0 -> 409 po_has_accepted_receipts.
        $this->postWrite($chapterHead, "$poUrl/$poId/cancel", [
            'expected_version' => 7, 'expected_material_version' => 2, 'reason' => 'Try cancel after receipt',
        ])->assertConflict()->assertJsonPath('error.code', 'po_has_accepted_receipts');

        // Amendment reducing ordered_quantity below accepted (30 < 40) -> 409 po_has_accepted_receipts.
        $this->postWrite($purchasing, "$poUrl/$poId/amendments", $this->amendmentPayload(7, 2, $poLine, '30.00', '120.00'))
            ->assertConflict()->assertJsonPath('error.code', 'po_has_accepted_receipts');

        // Amendment substituting variant on accepted line -> 409 po_has_accepted_receipts.
        $otherVariant = CatalogueVariant::create([
            'chapter_id' => $chapter->id, 'item_id' => $ctx['item']->id, 'code' => 'SYN-ALT',
            'name' => 'Alt Variant', 'quantity_scale' => 2, 'unit_id' => $ctx['unit']->id,
        ]);
        $subBody = $this->amendmentPayload(7, 2, $poLine, '60.00', '120.00');
        $subBody['lines'][0]['variant_id'] = $otherVariant->id;
        $this->postWrite($purchasing, "$poUrl/$poId/amendments", $subBody)
            ->assertConflict()->assertJsonPath('error.code', 'po_has_accepted_receipts');

        // Amendment pushing total into >10,000 tier (100 * 120 = 12,000 needs 3 quotes, only 2 exist) -> 409 quotation_policy_unmet.
        $this->postWrite($purchasing, "$poUrl/$poId/amendments", $this->amendmentPayload(7, 2, $poLine, '100.00', '120.00'))
            ->assertConflict()->assertJsonPath('error.code', 'quotation_policy_unmet')
            ->assertJsonPath('policy_evaluation.required_minimum_quotes', 3);

        // Valid amendment reducing ordered_quantity from 80 to 60 (>= 40 accepted, stays in <=10,000 tier).
        $proposer = $this->officer($chapter, ['PURCHASING', 'BUDGET_APPROVER'], '50000.00');
        $amendResp = $this->postWrite($proposer, "$poUrl/$poId/amendments", $this->amendmentPayload(7, 2, $poLine, '60.00', '120.00'))
            ->assertCreated()->assertJsonPath('data.resource_kind', 'purchase_order_amendment');
        $amendId = $amendResp->json('data.resource_id');

        // Second pending amendment blocked -> 409 invalid_transition.
        $this->postWrite($proposer, "$poUrl/$poId/amendments", $this->amendmentPayload(8, 2, $poLine, '65.00', '120.00'))
            ->assertConflict()->assertJsonPath('error.code', 'invalid_transition');

        // Three-party independence on approvePurchaseOrderAmendment: proposer, PO preparer, and RepF preparer all denied!
        foreach ([$proposer, $purchasing, $repfPreparer] as $nonIndependent) {
            $this->postWrite($nonIndependent, "$poUrl/$poId/amendments/$amendId/approve", [
                'expected_version' => 8, 'expected_material_version' => 2, 'approval_notes' => 'Self approve',
            ])->assertForbidden()->assertJsonPath('error.code', 'independence_required');
        }

        // Independent Chapter Head approves amendment -> bumps version (9) and material_version (3), outstanding = 20, RepF remaining = 40.
        $this->postWrite($chapterHead, "$poUrl/$poId/amendments/$amendId/approve", [
            'expected_version' => 8, 'expected_material_version' => 2, 'approval_notes' => 'Approved reduction to 60.',
        ])->assertOk()->assertJsonPath('data.committed_version', 9)->assertJsonPath('data.committed_material_version', 3)
            ->assertJsonPath('data.result.purchase_order.approved_amendment_count', 1)
            ->assertJsonPath('data.result.purchase_order.lines.0.ordered_quantity', '60.00')
            ->assertJsonPath('data.result.purchase_order.lines.0.accepted_quantity', '40.00')
            ->assertJsonPath('data.result.purchase_order.lines.0.rejected_or_disputed_quantity', '10.00')
            ->assertJsonPath('data.result.purchase_order.lines.0.outstanding_quantity', '20.00');
        $this->assertSame('40.00', (string) BigDecimal::of($repfLine->fresh()->remaining_to_order_quantity)->toScale(2));

        // Close-short zeroes outstanding (20 -> closed_short_quantity) while preserving accepted (40) & rejected/disputed (10).
        $this->postWrite($chapterHead, "$poUrl/$poId/close-short", [
            'expected_version' => 9, 'expected_material_version' => 3, 'reason' => 'Supplier discontinued remaining stock.',
        ])->assertOk()->assertJsonPath('data.result.status', 'closed_short')
            ->assertJsonPath('data.result.lines.0.closed_short_quantity', '20.00')
            ->assertJsonPath('data.result.lines.0.outstanding_quantity', '0.00')
            ->assertJsonPath('data.result.lines.0.accepted_quantity', '40.00')
            ->assertJsonPath('data.result.lines.0.rejected_or_disputed_quantity', '10.00');

        // History (newest first), immutable version snapshot, related, list filters, and XSS-escaped print!
        $this->asBrowserOfficer($chapterHead->id)->get("$poUrl/$poId/history")
            ->assertOk()->assertJsonPath('data.0.action', 'closeShortPurchaseOrder')->assertJsonPath('data.0.version', 10)
            ->assertJsonPath('data.1.action', 'approvePurchaseOrderAmendment')->assertJsonPath('data.1.amendment_id', $amendId);
        $this->asBrowserOfficer($chapterHead->id)->get("$poUrl/$poId/versions/6")
            ->assertOk()->assertJsonPath('data.status', 'issued')->assertJsonPath('data.lines.0.ordered_quantity', '80.00');
        $this->asBrowserOfficer($chapterHead->id)->get("$poUrl/$poId/related")
            ->assertOk()->assertJsonPath('data.0.kind', 'quotation')->assertJsonPath('data.1.kind', 'repf')->assertJsonPath('data.2.kind', 'supplier_selection');
        $this->asBrowserOfficer($chapterHead->id)->get("$poUrl?status=closed_short&repf_id={$repf->id}&linked_demand_canceled=false&q=SYN")
            ->assertOk()->assertJsonCount(1, 'data');

        $print = $this->asBrowserOfficer($chapterHead->id)->get("$poUrl/$poId/print")->assertOk()
            ->assertHeader('Cache-Control', 'no-store')->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        $print->assertSee('&lt;script&gt;x&lt;/script&gt;', false)->assertDontSee('<script>', false);

        // Recovery via /procurement-operations/by-key for approvePurchaseOrder & 404 for other actor.
        $this->asBrowserOfficer($budgetApprover->id)->get("$base/procurement-operations/by-key?operation_name=approvePurchaseOrder&action_key=$approveKey")
            ->assertOk()->assertExactJson($issued->json());
        $this->asBrowserOfficer($purchasing->id)->get("$base/procurement-operations/by-key?operation_name=approvePurchaseOrder&action_key=$approveKey")
            ->assertNotFound()->assertJsonPath('error.code', 'operation_not_found');

        // Emergency waiver approval duty gate + unreceived issued PO cancellation restoring RepF remaining quantity!
        $qWaiver = $this->postWrite($purchasing, "$base/repfs/{$repf->id}/quotations", $this->quotePayload($repfLine, '20.00', '100.00', null, 'Emergency Vendor'))->assertCreated()->json('data.result');
        $selWaiver = $this->postWrite($purchasing, "$base/repfs/{$repf->id}/supplier-selection", [
            'expected_repf_version' => $repf->fresh()->version, 'expected_repf_material_version' => 1,
            'selected_quotation_id' => $qWaiver['id'], 'comparable_quotation_ids' => [$qWaiver['id']],
            'selection_rationale' => 'Urgent sole vendor', 'emergency_waiver' => ['reason' => 'Typhoon emergency'],
        ])->assertCreated()->json('data.result');
        $po2Id = $this->postWrite($purchasing, $poUrl, $this->poPayload($repf->id, $selWaiver['id'], $repfLine->id, $qWaiver['lines'][0]['id'], $ctx['variant']->id, $ctx['unit']->id, '20.00', '100.00'))
            ->assertCreated()->json('data.resource_id');
        $this->postWrite($purchasing, "$poUrl/$po2Id/submit", ['expected_version' => 1, 'expected_material_version' => 1])->assertOk();

        // Policy emergency_waiver.approving_duties = ['CHAPTER_HEAD'] -> BUDGET_APPROVER denied with 403 duty_denied!
        $this->postWrite($budgetApprover, "$poUrl/$po2Id/approve", ['expected_version' => 2, 'expected_material_version' => 1, 'approval_notes' => null])
            ->assertForbidden()->assertJsonPath('error.code', 'duty_denied');
        // CHAPTER_HEAD succeeds -> allocates PO-YYYY-000002!
        $po2Ref = 'PO-'.now('Asia/Manila')->year.'-000002';
        $this->postWrite($chapterHead, "$poUrl/$po2Id/approve", ['expected_version' => 2, 'expected_material_version' => 1, 'approval_notes' => null])
            ->assertOk()->assertJsonPath('data.result.po_reference', $po2Ref);
        $this->assertSame('20.00', (string) BigDecimal::of($repfLine->fresh()->remaining_to_order_quantity)->toScale(2));

        // Post-issuance cancel of unreceived PO2: PURCHASING denied (403 duty_denied), Chapter Head succeeds, retains po_reference, restores RepF remaining to 40.00!
        $purchasingOnly = $this->officer($chapter, ['PURCHASING']);
        $this->postWrite($purchasingOnly, "$poUrl/$po2Id/cancel", ['expected_version' => 3, 'expected_material_version' => 1, 'reason' => 'Canceled'])
            ->assertForbidden()->assertJsonPath('error.code', 'duty_denied');
        $this->postWrite($chapterHead, "$poUrl/$po2Id/cancel", ['expected_version' => 3, 'expected_material_version' => 1, 'reason' => 'Supplier failed to ship'])
            ->assertOk()->assertJsonPath('data.result.status', 'canceled')
            ->assertJsonPath('data.result.po_reference', $po2Ref)
            ->assertJsonPath('data.result.lines.0.canceled_quantity', '20.00')
            ->assertJsonPath('data.result.lines.0.outstanding_quantity', '0.00');
        $this->assertSame('40.00', (string) BigDecimal::of($repfLine->fresh()->remaining_to_order_quantity)->toScale(2));
    }

    private function setupProcurementContext(string $approvedBudget = '10000.00', string $requestedQty = '40.00'): array
    {
        $chapter = Chapter::create(['id' => (string) Str::uuid(), 'code' => 'SYN-PO', 'name' => 'Procurement chapter']);
        $repfPreparer = $this->officer($chapter, ['INVENTORY']);
        $purchasing = $this->officer($chapter, ['PURCHASING', 'INVENTORY']);
        $head = $this->officer($chapter, ['CHAPTER_HEAD', 'INVENTORY'], '50000.00');
        $unit = CatalogueUnit::create([
            'chapter_id' => $chapter->id, 'code' => 'PCS', 'name' => 'Piece', 'quantity_kind' => 'measured', 'quantity_scale' => 2,
        ]);
        $item = CatalogueItem::create(['chapter_id' => $chapter->id, 'code' => 'SYN-SHIRT', 'name' => 'Chapter Shirt', 'unit_id' => $unit->id]);
        $variant = CatalogueVariant::create([
            'chapter_id' => $chapter->id, 'item_id' => $item->id, 'code' => 'SYN-SHIRT-M',
            'name' => 'Chapter Shirt M', 'quantity_scale' => 2, 'unit_id' => $unit->id,
        ]);
        $this->app->instance(NetShortageSnapshotParticipant::class, new RepfShortageSnapshot);

        $created = $this->createRepfRow($chapter, $repfPreparer, $variant, $unit, 'approved', $approvedBudget, $requestedQty);

        return [
            'chapter' => $chapter, 'repf_preparer' => $repfPreparer, 'purchasing' => $purchasing, 'head' => $head,
            'unit' => $unit, 'item' => $item, 'variant' => $variant,
            'repf' => $created['repf'], 'repf_line' => $created['line'],
        ];
    }

    private function createRepfRow(
        Chapter $chapter,
        User $preparer,
        CatalogueVariant $variant,
        CatalogueUnit $unit,
        string $status,
        ?string $approvedBudget,
        string $requestedQty = '40.00',
    ): array {
        $repf = Repf::create([
            'id' => (string) Str::uuid(), 'chapter_id' => $chapter->id, 'status' => $status,
            'version' => 1, 'material_version' => 1,
            'repf_reference' => $status === 'draft' ? null : 'REPF-2026-000001',
            'prepared_by' => $preparer->id, 'funding_source' => 'chapter_funds', 'urgency' => 'normal',
            'justification' => 'Replenish stock', 'estimated_total_php' => $approvedBudget ?? '1000.00',
            'approved_budget_php' => $approvedBudget,
        ]);
        $line = RepfLine::create([
            'id' => (string) Str::uuid(), 'repf_id' => $repf->id, 'line_number' => 1,
            'trigger_kind' => 'rop_replenishment', 'item_id' => $variant->item_id,
            'variant_id' => $variant->id, 'unit_id' => $unit->id, 'quantity_scale' => 2,
            'requested_quantity' => $requestedQty, 'ordered_quantity' => '0.00', 'canceled_quantity' => '0.00',
            'remaining_to_order_quantity' => $requestedQty, 'estimated_unit_cost_php' => '120.00',
            'estimated_line_total_php' => $approvedBudget ?? '1000.00', 'net_need_breakdown' => [],
        ]);
        if ($status === 'approved') {
            Stage2RecordHistory::create([
                'id' => (string) Str::uuid(), 'chapter_id' => $chapter->id, 'record_kind' => 'repf', 'record_id' => $repf->id,
                'sequence_no' => 1, 'version' => 1, 'material_version' => 1, 'is_version_snapshot' => true,
                'event_type' => 'approveRepf', 'actor_user_id' => $preparer->id, 'reason' => null,
                'snapshot_json' => ['status' => 'approved', 'repf_reference' => $repf->repf_reference],
                'operation_json' => ['from_status' => 'pending_budget_review'], 'recorded_at' => now('UTC'),
            ]);
        }

        return ['repf' => $repf, 'line' => $line];
    }

    private function installQuotationPolicy(Chapter $chapter, User $approver, array $waiverDuties, bool $waiverPermitted): PolicyRecord
    {
        $id = (string) Str::uuid();
        $rules = [
            'currency' => 'PHP',
            'tiers' => [
                ['min_amount_php' => '0.00', 'max_amount_php' => '10000.00', 'minimum_comparable_quotes' => 2],
                ['min_amount_php' => '10000.01', 'max_amount_php' => null, 'minimum_comparable_quotes' => 3],
            ],
            'emergency_waiver' => [
                'permitted' => $waiverPermitted,
                'require_reason' => $waiverPermitted,
                'minimum_quotes_when_waived' => $waiverPermitted ? 1 : null,
                'approving_duties' => $waiverPermitted ? $waiverDuties : [],
            ],
        ];
        $policy = PolicyRecord::create([
            'id' => $id, 'aggregate_id' => $id, 'chapter_id' => $chapter->id,
            'policy_code' => 'purchasing_quotation_policy', 'policy_version' => 1,
            'rules_json' => $rules, 'effective_from' => now()->subDay(),
        ]);
        AuditLog::create([
            'chapter_id' => $chapter->id, 'user_id' => $approver->id, 'action' => 'controlled:recordPolicy',
            'entity_type' => 'policy', 'entity_id' => $id,
            'details' => [
                'version' => 1, 'subject_id' => null, 'value_schema_reference' => '#/components/schemas/PurchasingQuotationPolicyValue',
                'value_sha256' => CanonicalJson::sha256($rules), 'approvals' => [['authority' => 'CHAPTER_HEAD', 'approver_id' => $approver->id]],
            ],
        ]);

        return $policy;
    }

    private function installPoSeries(Chapter $chapter, User $approver): PolicyRecord
    {
        $id = (string) Str::uuid();
        $rules = ['document_kind' => 'PO', 'prefix' => 'PO', 'sequence_width' => 6, 'year_basis' => 'Asia/Manila'];
        $policy = PolicyRecord::create([
            'id' => $id, 'aggregate_id' => $id, 'chapter_id' => $chapter->id,
            'policy_code' => 'reference_series', 'policy_version' => 1,
            'rules_json' => $rules, 'effective_from' => now()->subDay(),
        ]);
        AuditLog::create([
            'chapter_id' => $chapter->id, 'user_id' => $approver->id, 'action' => 'controlled:recordPolicy',
            'entity_type' => 'policy', 'entity_id' => $id,
            'details' => [
                'version' => 1, 'subject_id' => null, 'value_schema_reference' => '#/components/schemas/PoReferenceSeriesPolicyValue',
                'value_sha256' => CanonicalJson::sha256($rules), 'approvals' => [['authority' => 'CHAPTER_HEAD', 'approver_id' => $approver->id]],
            ],
        ]);

        return $policy;
    }

    private function quotePayload(RepfLine $repfLine, string $qty, string $price, ?array $evidence = null, string $supplier = 'Vendor A'): array
    {
        return [
            'supplier' => [
                'supplier_name' => $supplier, 'supplier_subtype' => 'wholesaler',
                'contact_reference' => 'sales@vendor.example.invalid', 'supplier_reference' => 'REF-01',
            ],
            'quoted_at' => '2026-11-26T04:00:00.000000Z', 'valid_until' => '2026-12-10', 'lead_time_days' => 5,
            'availability_summary' => 'In stock', 'quality_warranty_terms' => '30-day warranty',
            'payment_and_delivery_terms' => 'Net 15', 'reliability_notes' => null, 'evidence' => $evidence,
            'lines' => [[
                'repf_line_id' => $repfLine->id, 'variant_id' => $repfLine->variant_id, 'unit_id' => $repfLine->unit_id,
                'quoted_quantity' => $qty, 'unit_price_php' => $price, 'notes' => null,
            ]],
        ];
    }

    private function poPayload(string $repfId, string $selId, string $repfLineId, string $quoteLineId, string $variantId, string $unitId, string $qty, string $price): array
    {
        return [
            'repf_id' => $repfId, 'supplier_selection_id' => $selId,
            'delivery_location' => 'Cebu Chapter Stockroom', 'expected_delivery_date' => '2026-12-01',
            'payment_and_delivery_terms' => 'Net 15 upon delivery',
            'lines' => [[
                'repf_line_id' => $repfLineId, 'quotation_line_id' => $quoteLineId,
                'variant_id' => $variantId, 'unit_id' => $unitId,
                'ordered_quantity' => $qty, 'unit_price_php' => $price,
                'specifications' => '220gsm combed cotton shirt', 'notes' => null,
            ]],
        ];
    }

    private function amendmentPayload(int $version, int $material, PurchaseOrderLine $line, string $qty, string $price): array
    {
        return [
            'expected_version' => $version, 'expected_material_version' => $material,
            'delivery_location' => 'Cebu Stockroom Gate 2', 'expected_delivery_date' => '2026-12-12',
            'payment_and_delivery_terms' => 'Net 15 days', 'reason' => 'Adjust remaining quantity.',
            'lines' => [[
                'po_line_id' => $line->id, 'repf_line_id' => $line->repf_line_id,
                'variant_id' => $line->variant_id, 'unit_id' => $line->unit_id,
                'ordered_quantity' => $qty, 'unit_price_php' => $price,
                'specifications' => '220gsm combed cotton shirt', 'notes' => null,
            ]],
        ];
    }

    private function postWrite(User $actor, string $url, array $body, ?string $key = null): TestResponse
    {
        return $this->asBrowserOfficer($actor->id, $key ?? (string) Str::uuid())->postJson($url, $body);
    }

    private function officer(Chapter $chapter, array $duties, ?string $limit = null): User
    {
        $user = User::create([
            'name' => 'Officer '.Str::random(4), 'public_id' => (string) Str::uuid(),
            'email' => Str::uuid().'@example.invalid', 'password_hash' => Hash::make('Synthetic test credential'),
        ]);
        $user->memberships()->create(['chapter_id' => $chapter->id]);
        foreach ($duties as $duty) {
            $user->dutyGrants()->create([
                'chapter_id' => $chapter->id, 'duty_code' => $duty, 'scope' => ['limit_php' => $limit],
            ]);
        }

        return $user;
    }
}
