<?php

namespace Tests\Feature\Stage2;

use App\Models\AuditLog;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\DomainNotificationOutbox;
use App\Models\InventoryLot;
use App\Models\PolicyRecord;
use App\Models\StockHold;
use App\Models\User;
use App\Services\Inventory\Participants\LotRestrictionResolutionParticipant;
use App\Services\Notifications\NotificationSubjectRead;
use App\Services\Shared\CanonicalJson;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\Feature\Stage2\Fixtures\DonationLotRestrictionFake;
use Tests\TestCase;

class DonationWorkflowTest extends TestCase
{
    use AuthenticatesBrowserOfficer, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('evidence');
    }

    public function test_valuation_rounding_modes_policy_change_conflict_and_zero_money_side_effects(): void
    {
        [$chapter, $preparer, $approver, $variant, $unit] = $this->scenario();
        $url = "/api/v1/chapters/{$chapter->id}/donations";
        $payload = $this->draftPayload($variant->id, $unit->id, [
            'pledged_quantity' => '1.25',
            'unit_value_php' => '10.02', // exact 12.525 -> half_up=12.53, half_even=12.52, down=12.52
        ]);

        // Missing valuation_rounding policy -> 409 setup_blocked
        $this->write($preparer, $url, $payload)
            ->assertConflict()
            ->assertJsonPath('error.code', 'setup_blocked')
            ->assertJsonPath('error.blockers.0.setting_key', 'valuation_rounding')
            ->assertJsonMissingPath('failed_intent_committed');

        // Unsupported restriction / allowed_uses / scale validation -> 422
        $valPolicy = $this->valuationPolicy($chapter, $approver, 'half_up');
        $badUse = $payload;
        $badUse['lines'][0]['restrictions'] = [
            'state' => 'bounded',
            'allowed_uses' => ['give_away'],
            'event_ids' => [],
            'requesting_unit_ids' => [],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => (string) Str::uuid(),
            'source_condition_reference' => 'Paper line 1',
        ];
        $this->write($preparer, $url, $badUse)->assertUnprocessable()
            ->assertJsonPath('error.fields.0.pointer', '/lines/0/restrictions/allowed_uses/0');

        $badScale = $payload;
        $badScale['lines'][0]['pledged_quantity'] = '1.255';
        $this->write($preparer, $url, $badScale)->assertUnprocessable()
            ->assertJsonPath('error.fields.0.pointer', '/lines/0/pledged_quantity');

        // half_up rounds 12.525 -> 12.53
        $created = $this->write($preparer, $url, $payload)->assertCreated();
        $created->assertJsonPath('data.http_status', 201)
            ->assertJsonPath('data.restriction_resolution', null)
            ->assertJsonPath('data.result.lines.0.pledged_value_php', '12.53')
            ->assertJsonPath('data.result.pledged_total_value_php', '12.53');
        $daId = $created->json('data.result.da_id');

        // RCV-13: zero cash, Official Receipt, sales order, or inventory movement side effects
        $this->assertDatabaseCount('sales_orders', 0);
        $this->assertDatabaseCount('inventory_movements', 0);
        $this->assertDatabaseCount('inventory_lots', 0);

        // Policy upgraded to half_even v2 -> alters material -> submit blocks with 409 version_conflict
        $valPolicy->update(['effective_until' => now()->subSecond()]);
        $valPolicyV2 = $this->valuationPolicy($chapter, $approver, 'half_even', $valPolicy->aggregate_id, 2);

        $this->write($preparer, "$url/$daId/submit", ['expected_version' => 1, 'expected_material_version' => 1])
            ->assertConflict()
            ->assertJsonPath('error.code', 'version_conflict')
            ->assertJsonPath('failed_intent_committed', false)
            ->assertJsonPath('current.da_id', $daId);

        // Replace draft under half_even v2 -> rounds 12.525 -> 12.52
        $replaced = $this->putWrite($preparer, "$url/$daId", [
            'expected_version' => 1,
            'expected_material_version' => 1,
        ] + $payload)->assertOk();
        $replaced->assertJsonPath('data.result.version', 2)
            ->assertJsonPath('data.result.material_version', 2)
            ->assertJsonPath('data.result.valuation_policy.version', 2)
            ->assertJsonPath('data.result.lines.0.pledged_value_php', '12.52')
            ->assertJsonPath('data.result.pledged_total_value_php', '12.52');

        // down mode rounds 1.25 * 10.03 = 12.5375 -> 12.53
        $valPolicyV2->update(['effective_until' => now()->subSecond()]);
        $this->valuationPolicy($chapter, $approver, 'down', $valPolicy->aggregate_id, 3);
        $downDraft = $this->write($preparer, $url, $this->draftPayload($variant->id, $unit->id, [
            'pledged_quantity' => '1.25',
            'unit_value_php' => '10.03',
        ]))->assertCreated();
        $downDraft->assertJsonPath('data.result.lines.0.pledged_value_php', '12.53');
    }

    public function test_da_authorization_signed_acknowledgment_once_only_numbering_return_revise_and_decline(): void
    {
        [$chapter, $preparer, $approver, $variant, $unit] = $this->scenario();
        $receivingOnly = $this->officer($chapter, ['RECEIVING']);
        $headOnly = $this->officer($chapter, ['CHAPTER_HEAD']);
        $this->valuationPolicy($chapter, $approver, 'half_up');

        $url = "/api/v1/chapters/{$chapter->id}/donations";
        $payload = $this->draftPayload($variant->id, $unit->id, [
            'pledged_quantity' => '10.00',
            'unit_value_php' => '12.50',
            'donor_name' => '<script>alert("xss")</script> Foundation',
        ]);

        $draft = $this->write($preparer, $url, $payload)->assertCreated();
        $daId = $draft->json('data.result.da_id');

        $submitted = $this->write($preparer, "$url/$daId/submit", ['expected_version' => 1, 'expected_material_version' => 1])
            ->assertOk()
            ->assertJsonPath('data.result.status', 'pending_acknowledgment')
            ->assertJsonPath('data.result.reference', null);

        // Missing da_authorization -> 409 setup_blocked
        $paper = $this->uploadPaper($chapter, $approver, 'da_acknowledgment', $daId);
        $ackBody = [
            'expected_version' => 2,
            'expected_material_version' => 1,
            'evidence' => $this->byteBinding($paper),
            'signed_at' => now('UTC')->subMinute()->format('Y-m-d\TH:i:s.u\Z'),
            'confirm_paper_matches' => true,
        ];
        $this->write($approver, "$url/$daId/acknowledge", $ackBody)
            ->assertConflict()
            ->assertJsonPath('error.code', 'setup_blocked')
            ->assertJsonPath('error.blockers.0.setting_key', 'da_authorization');

        // Seed da_authorization allowing CHAPTER_HEAD & INVENTORY with require_preparer_independence: true
        $this->daAuthPolicy($chapter, $approver, ['CHAPTER_HEAD', 'INVENTORY'], ['CHAPTER_HEAD', 'FINANCE'], true);

        // RECEIVING is not in acknowledge_duties -> 403 duty_denied
        $this->write($receivingOnly, "$url/$daId/acknowledge", $ackBody)
            ->assertForbidden()
            ->assertJsonPath('error.code', 'duty_denied');

        // Preparer has INVENTORY (in acknowledge_duties) but independence blocks -> 403 independence_required
        $this->write($preparer, "$url/$daId/acknowledge", $ackBody)
            ->assertForbidden()
            ->assertJsonPath('error.code', 'independence_required');

        // Missing evidence -> 409 evidence_missing
        $badEvidence = $ackBody;
        $badEvidence['evidence']['evidence_id'] = (string) Str::uuid();
        $this->write($approver, "$url/$daId/acknowledge", $badEvidence)
            ->assertConflict()
            ->assertJsonPath('error.code', 'evidence_missing')
            ->assertJsonPath('current.status', 'pending_acknowledgment');

        // Mismatched sha256 -> 409 evidence_mismatch
        $badHash = $ackBody;
        $badHash['evidence']['attachments'][0]['sha256'] = str_repeat('a', 64);
        $this->write($approver, "$url/$daId/acknowledge", $badHash)
            ->assertConflict()
            ->assertJsonPath('error.code', 'evidence_mismatch');

        // Missing DA reference_series -> 409 setup_blocked, rolls back cleanly
        $this->write($approver, "$url/$daId/acknowledge", $ackBody)
            ->assertConflict()
            ->assertJsonPath('error.code', 'setup_blocked')
            ->assertJsonPath('error.blockers.0.setting_key', 'reference_series');
        $this->assertDatabaseHas('donations', ['id' => $daId, 'status' => 'pending_acknowledgment', 'reference' => null]);

        // Seed DA reference_series -> acknowledge succeeds and allocates once-only yearly DA reference
        $this->daSeriesPolicy($chapter, $approver);
        $ackKey = (string) Str::uuid();
        $acked = $this->write($approver, "$url/$daId/acknowledge", $ackBody, $ackKey)
            ->assertOk()
            ->assertHeader('X-Action-Replayed', 'false');
        $expectedRef = 'CEBDA-'.now('Asia/Manila')->year.'-000001';
        $acked->assertJsonPath('data.result.status', 'acknowledged')
            ->assertJsonPath('data.result.reference', $expectedRef)
            ->assertJsonPath('data.result.acknowledgment.actor_id', $approver->id)
            ->assertJsonPath('data.result.acknowledgment.snapshot.target.purpose', 'da_acknowledgment');

        // Exact replay returns 200 with X-Action-Replayed: true; mutated payload -> 409 action_key_conflict
        $this->write($approver, "$url/$daId/acknowledge", $ackBody, $ackKey)
            ->assertOk()
            ->assertHeader('X-Action-Replayed', 'true')
            ->assertExactJson($acked->json());
        $mutated = $ackBody;
        $mutated['signed_at'] = now('UTC')->format('Y-m-d\TH:i:s.u\Z');
        $this->write($approver, "$url/$daId/acknowledge", $mutated, $ackKey)
            ->assertConflict()
            ->assertJsonPath('error.code', 'action_key_conflict')
            ->assertJsonPath('current', null);

        // Evidence omission without evidence.read (headOnly has CHAPTER_HEAD, no evidence.read)
        $this->asBrowserOfficer($headOnly->id)->get("$url/$daId")
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store')
            ->assertJsonPath('data.reference', $expectedRef)
            ->assertJsonPath('data.acknowledgment', null);
        // Preparer has INVENTORY (includes evidence.read) -> receives full acknowledgment metadata
        $this->asBrowserOfficer($preparer->id)->get("$url/$daId")
            ->assertOk()
            ->assertJsonPath('data.acknowledgment.binding.evidence_id', $paper['evidence_id']);

        // Escaped print HTML with strict CSP + nosniff and no raw evidence URLs / attachment IDs
        $print = $this->asBrowserOfficer($headOnly->id)->get("$url/$daId/print")
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        $print->assertSee('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', false)
            ->assertDontSee('<script>', false)
            ->assertDontSee($paper['evidence_id'], false)
            ->assertDontSee($paper['attachments'][0]['attachment_id'], false);

        // Second DA exercises return -> revise -> resubmit -> decline
        $second = $this->write($preparer, $url, $this->draftPayload($variant->id, $unit->id))->assertCreated();
        $secondId = $second->json('data.result.da_id');
        $this->write($preparer, "$url/$secondId/submit", ['expected_version' => 1, 'expected_material_version' => 1])->assertOk();
        $this->write($approver, "$url/$secondId/return", ['expected_version' => 2, 'expected_material_version' => 1, 'reason' => '   '])
            ->assertUnprocessable()->assertJsonPath('error.fields.0.pointer', '/reason');
        $this->write($approver, "$url/$secondId/return", ['expected_version' => 2, 'expected_material_version' => 1, 'reason' => 'Clarify donor terms'])
            ->assertOk()->assertJsonPath('data.result.status', 'returned_for_revision');
        $this->write($preparer, "$url/$secondId/revise", ['expected_version' => 3, 'expected_material_version' => 1])
            ->assertOk()->assertJsonPath('data.result.status', 'draft')->assertJsonPath('data.result.material_version', 1);
        $this->write($preparer, "$url/$secondId/submit", ['expected_version' => 4, 'expected_material_version' => 1])->assertOk();
        $this->write($approver, "$url/$secondId/decline", ['expected_version' => 5, 'expected_material_version' => 1, 'reason' => 'Terms incompatible'])
            ->assertOk()->assertJsonPath('data.result.status', 'declined');
    }

    public function test_restriction_resolutions_apply_vs_audit_review_holds_and_outbox_coemission(): void
    {
        [$chapter, $preparer, $approver, $variant, $unit] = $this->scenario();
        $fake = new DonationLotRestrictionFake;
        $this->app->instance(LotRestrictionResolutionParticipant::class, $fake);

        $this->valuationPolicy($chapter, $approver, 'half_up');
        $this->daAuthPolicy($chapter, $approver, ['CHAPTER_HEAD'], ['CHAPTER_HEAD', 'FINANCE'], true);
        $this->daSeriesPolicy($chapter, $approver);

        $url = "/api/v1/chapters/{$chapter->id}/donations";
        $uninterpreted = [
            'state' => 'uninterpreted',
            'allowed_uses' => [],
            'event_ids' => [],
            'requesting_unit_ids' => [],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => null,
            'source_condition_reference' => 'Paper line 1: preferential access during fiesta',
        ];
        $bounded = [
            'state' => 'bounded',
            'allowed_uses' => ['internal_use'],
            'event_ids' => [],
            'requesting_unit_ids' => [],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => (string) Str::uuid(),
            'source_condition_reference' => 'Paper line 2: distribution only',
        ];

        $draft = $this->write($preparer, $url, [
            'donor_name' => 'Community Donor',
            'lines' => [
                $this->lineInput($variant->id, $unit->id, '5.00', '10.00', $uninterpreted),
                $this->lineInput($variant->id, $unit->id, '3.00', '10.00', $bounded),
            ],
        ])->assertCreated();
        $daId = $draft->json('data.result.da_id');
        $line1Id = $draft->json('data.result.lines.0.line_id');
        $line2Id = $draft->json('data.result.lines.1.line_id');

        $this->write($preparer, "$url/$daId/submit", ['expected_version' => 1, 'expected_material_version' => 1])->assertOk();
        $ackPaper = $this->uploadPaper($chapter, $approver, 'da_acknowledgment', $daId);
        $this->write($approver, "$url/$daId/acknowledge", [
            'expected_version' => 2,
            'expected_material_version' => 1,
            'evidence' => $this->byteBinding($ackPaper),
            'signed_at' => now('UTC')->subMinutes(5)->format('Y-m-d\TH:i:s.u\Z'),
            'confirm_paper_matches' => true,
        ])->assertOk();

        // 1. Audit review while zero lots are posted -> keeps uninterpreted, material_version unchanged, participant NOT called, zero stock-lot events
        $auditPaper = $this->uploadPaper($chapter, $approver, 'donor_restriction_resolution', $daId);
        $auditRes = $this->write($approver, "$url/$daId/restriction-resolutions", [
            'expected_version' => 3,
            'expected_material_version' => 1,
            'evidence' => $this->byteBinding($auditPaper),
            'signed_at' => now('UTC')->subMinutes(4)->format('Y-m-d\TH:i:s.u\Z'),
            'confirm_paper_matches' => true,
            'da_line_id' => $line1Id,
            'reason' => 'Condition remains inexpressible pending legal review.',
            'resolution_kind' => 'audit_review',
            'restrictions' => $uninterpreted,
        ])->assertCreated();
        $auditRes->assertJsonPath('data.http_status', 201)
            ->assertJsonPath('data.result.version', 4)
            ->assertJsonPath('data.result.material_version', 1)
            ->assertJsonPath('data.result.lines.0.restrictions.state', 'uninterpreted')
            ->assertJsonPath('data.restriction_resolution.resolution_kind', 'audit_review');
        $this->assertCount(0, $fake->calls);
        $this->assertSame(0, DomainNotificationOutbox::where('event_name', 'stage1.stock-lot.changed.v1')->count());

        // Reject audit_review that tries to unblock stock -> 422
        $this->write($approver, "$url/$daId/restriction-resolutions", [
            'expected_version' => 4,
            'expected_material_version' => 1,
            'evidence' => $this->byteBinding($auditPaper),
            'signed_at' => now('UTC')->subMinutes(3)->format('Y-m-d\TH:i:s.u\Z'),
            'confirm_paper_matches' => true,
            'da_line_id' => $line1Id,
            'reason' => 'Attempt to clear restriction via audit',
            'resolution_kind' => 'audit_review',
            'restrictions' => $this->unrestricted(),
        ])->assertUnprocessable()->assertJsonPath('error.fields.0.pointer', '/restrictions/state');

        // Reject reusing already-committed resolution evidence lineage -> 409 evidence_mismatch
        $resolvedBounded = [
            'state' => 'bounded',
            'allowed_uses' => ['internal_use'],
            'event_ids' => [],
            'requesting_unit_ids' => [(string) Str::uuid()],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => (string) Str::uuid(),
            'source_condition_reference' => 'Paper line 1: preferential access during fiesta',
        ];
        $this->write($approver, "$url/$daId/restriction-resolutions", [
            'expected_version' => 4,
            'expected_material_version' => 1,
            'evidence' => $this->byteBinding($auditPaper),
            'signed_at' => now('UTC')->subMinutes(3)->format('Y-m-d\TH:i:s.u\Z'),
            'confirm_paper_matches' => true,
            'da_line_id' => $line1Id,
            'reason' => 'Reuse old evidence',
            'resolution_kind' => 'apply',
            'restrictions' => $resolvedBounded,
        ])->assertConflict()->assertJsonPath('error.code', 'evidence_mismatch');

        // Reject foreign/unknown line -> 404 resource_not_found
        $applyPaper1 = $this->uploadPaper($chapter, $approver, 'donor_restriction_resolution', $daId);
        $this->write($approver, "$url/$daId/restriction-resolutions", [
            'expected_version' => 4,
            'expected_material_version' => 1,
            'evidence' => $this->byteBinding($applyPaper1),
            'signed_at' => now('UTC')->subMinutes(3)->format('Y-m-d\TH:i:s.u\Z'),
            'confirm_paper_matches' => true,
            'da_line_id' => (string) Str::uuid(),
            'reason' => 'Unknown line',
            'resolution_kind' => 'apply',
            'restrictions' => $resolvedBounded,
        ])->assertNotFound()->assertJsonPath('error.code', 'resource_not_found');

        // Reject invalid transition bounded -> unrestricted -> 409 invalid_transition
        $this->write($approver, "$url/$daId/restriction-resolutions", [
            'expected_version' => 4,
            'expected_material_version' => 1,
            'evidence' => $this->byteBinding($applyPaper1),
            'signed_at' => now('UTC')->subMinutes(3)->format('Y-m-d\TH:i:s.u\Z'),
            'confirm_paper_matches' => true,
            'da_line_id' => $line2Id,
            'reason' => 'Cannot remove bounded restriction entirely',
            'resolution_kind' => 'apply',
            'restrictions' => $this->unrestricted(),
        ])->assertConflict()->assertJsonPath('error.code', 'invalid_transition');

        // 2. Apply with zero posted lot segments yet -> succeeds cleanly, zero stock-lot outbox events
        $applyZeroLots = $this->write($approver, "$url/$daId/restriction-resolutions", [
            'expected_version' => 4,
            'expected_material_version' => 1,
            'evidence' => $this->byteBinding($applyPaper1),
            'signed_at' => now('UTC')->subMinutes(3)->format('Y-m-d\TH:i:s.u\Z'),
            'confirm_paper_matches' => true,
            'da_line_id' => $line1Id,
            'reason' => 'Resolved before delivery',
            'resolution_kind' => 'apply',
            'restrictions' => $resolvedBounded,
        ])->assertCreated();
        $applyZeroLots->assertJsonPath('data.result.version', 5)
            ->assertJsonPath('data.result.material_version', 2)
            ->assertJsonPath('data.result.lines.0.restrictions.state', 'bounded');
        $this->assertCount(1, $fake->calls);
        $this->assertSame(0, DomainNotificationOutbox::where('event_name', 'stage1.stock-lot.changed.v1')->count());

        // 3. Seed a posted DA-RM stock lot + independent active StockHold for line 1; refine bounded -> bounded
        $location = CatalogueLocation::create([
            'id' => (string) Str::uuid(), 'chapter_id' => $chapter->id, 'code' => 'STOCK-1', 'name' => 'Main Stockroom',
            'kind' => 'stockroom', 'custodian_id' => $preparer->id, 'state' => 'active', 'material_version' => 1,
        ]);
        $lot = InventoryLot::create([
            'id' => (string) Str::uuid(), 'chapter_id' => $chapter->id, 'variant_id' => $variant->id, 'unit_id' => $unit->id,
            'location_id' => $location->id, 'lot_code' => 'DA-LOT-1', 'basis_segment_id' => (string) Str::uuid(),
            'condition' => 'usable', 'custody' => 'stockroom', 'custodian_user_id' => $preparer->id,
            'quantity_on_hand' => '2.000000', 'original_quantity' => '2.000000', 'quantity_scale' => 2,
            'segments' => [], 'stock_version' => 1, 'material_version' => 1,
            'source_kind' => 'da_rm', 'origin_source_id' => $daId, 'origin_source_line_id' => $line1Id,
            'restriction_state' => 'bounded', 'restrictions_json' => $resolvedBounded, 'immediately_allocatable' => true,
        ]);
        $hold = StockHold::create([
            'id' => (string) Str::uuid(), 'chapter_id' => $chapter->id,
            'reason_code' => 'quality_review', 'reason' => 'Independent inspection hold', 'status' => 'active',
            'placed_by_user_id' => $preparer->id, 'placed_at' => now('UTC'), 'version' => 1, 'material_version' => 1,
        ]);

        // Participant target_locked -> 409 target_locked, clean rollback
        $applyPaper2 = $this->uploadPaper($chapter, $approver, 'donor_restriction_resolution', $daId);
        $refinedBounded = array_replace($resolvedBounded, ['allowed_uses' => ['internal_use', 'sale']]);
        $fake->failure = ['outcome' => 'rejected', 'reason' => 'target_locked'];
        $this->write($approver, "$url/$daId/restriction-resolutions", [
            'expected_version' => 5,
            'expected_material_version' => 2,
            'evidence' => $this->byteBinding($applyPaper2),
            'signed_at' => now('UTC')->subMinutes(2)->format('Y-m-d\TH:i:s.u\Z'),
            'confirm_paper_matches' => true,
            'da_line_id' => $line1Id,
            'reason' => 'Refine allowed uses',
            'resolution_kind' => 'apply',
            'restrictions' => $refinedBounded,
        ])->assertConflict()->assertJsonPath('error.code', 'target_locked');
        $fake->failure = null;

        // Succeeds with lot update -> co-emits stage1.stock-lot.changed.v1, preserves quantity & active StockHold
        $resKey = (string) Str::uuid();
        $applied = $this->write($approver, "$url/$daId/restriction-resolutions", [
            'expected_version' => 5,
            'expected_material_version' => 2,
            'evidence' => $this->byteBinding($applyPaper2),
            'signed_at' => now('UTC')->subMinutes(2)->format('Y-m-d\TH:i:s.u\Z'),
            'confirm_paper_matches' => true,
            'da_line_id' => $line1Id,
            'reason' => 'Refine allowed uses',
            'resolution_kind' => 'apply',
            'restrictions' => $refinedBounded,
        ], $resKey)->assertCreated();
        $applied->assertJsonPath('data.result.version', 6)->assertJsonPath('data.result.material_version', 3);

        $lot->refresh();
        $hold->refresh();
        $this->assertSame('2.000000', (string) $lot->quantity_on_hand);
        $this->assertSame(['internal_use', 'sale'], $lot->restrictions_json['allowed_uses']);
        $this->assertSame('active', $hold->status);

        $lotEvent = DomainNotificationOutbox::where('event_name', 'stage1.stock-lot.changed.v1')->first();
        $this->assertNotNull($lotEvent);
        $this->assertSame($lot->id, $lotEvent->resource_id);
        $daEvent = DomainNotificationOutbox::where('event_name', 'stage2.donation.changed.v1')->latest('created_at')->first();
        $this->assertNotNull($daEvent);

        // NotificationSubjectRead parity
        $subjectRead = app(NotificationSubjectRead::class);
        $deniedUser = $this->officer($chapter, ['SALES_OFFICER']);
        DB::transaction(function () use ($subjectRead, $preparer, $approver, $deniedUser, $daEvent, $lotEvent) {
            $this->assertTrue($subjectRead->allows($preparer, $daEvent));
            $this->assertTrue($subjectRead->allows($approver, $daEvent));
            $this->assertFalse($subjectRead->allows($deniedUser, $daEvent));
            $this->assertTrue($subjectRead->allows($preparer, $lotEvent));
        });

        // History (newest first), immutable version read, and related records scoped by duty
        $this->asBrowserOfficer($preparer->id)->get("$url/$daId/history")
            ->assertOk()
            ->assertJsonCount(6, 'data')
            ->assertJsonPath('data.0.version', 6)
            ->assertJsonPath('data.0.action', 'resolveDonationRestriction')
            ->assertJsonPath('data.0.restriction_resolution.resolution_kind', 'apply')
            ->assertJsonPath('data.5.version', 1);
        $this->asBrowserOfficer($preparer->id)->get("$url/$daId/versions/1")
            ->assertOk()
            ->assertJsonPath('data.version', 1)
            ->assertJsonPath('data.status', 'draft');
        $this->asBrowserOfficer($preparer->id)->get("$url/$daId/related")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.resource_kind', 'stock_lot')
            ->assertJsonPath('data.0.resource_id', $lot->id)
            ->assertJsonPath('data.0.da_line_id', $line1Id);

        $date = now('Asia/Manila')->toDateString();
        $report = "/api/v1/chapters/{$chapter->id}/reports/control";
        $control = $this->asBrowserOfficer($approver->id)->get("$report?date_from=$date&date_to=$date")->assertOk();
        $control->assertJsonPath('totals.resolution_count', 3)
            ->assertJsonFragment(['previous_state' => 'uninterpreted', 'resolved_state' => 'uninterpreted'])
            ->assertJsonFragment(['evidence_id' => $applyPaper2['evidence_id'], 'affected_lot_count' => 1])
            ->assertJsonFragment(['action' => 'resolve_donation_restriction', 'record_id' => $daId]);
        $this->get("$report/print?date_from=$date&date_to=$date")->assertOk()->assertDontSee('/evidence/', false);

        // Recovery via /donation-operations/by-key and /{operation_id}
        $opId = $applied->json('data.operation_id');
        $byKeyUrl = "/api/v1/chapters/{$chapter->id}/donation-operations/by-key?operation_name=resolveDonationRestriction&action_key={$resKey}";
        $this->asBrowserOfficer($approver->id)->get($byKeyUrl)->assertOk()->assertExactJson($applied->json());
        $this->asBrowserOfficer($approver->id)->get("/api/v1/chapters/{$chapter->id}/donation-operations/{$opId}")->assertOk()->assertExactJson($applied->json());
        $this->asBrowserOfficer($preparer->id)->get($byKeyUrl)->assertNotFound()->assertJsonPath('error.code', 'operation_not_found');

        // Expiring da_authorization blocks policy-gated recovery with 409 setup_blocked
        PolicyRecord::where('chapter_id', $chapter->id)->where('policy_code', 'da_authorization')
            ->update(['effective_until' => now()->subSecond()]);
        $this->asBrowserOfficer($approver->id)->get($byKeyUrl)
            ->assertConflict()->assertJsonPath('error.code', 'setup_blocked');
    }

    public function test_cancel_vs_close_short_boundaries_search_filtering_and_cursor_staleness(): void
    {
        [$chapter, $preparer, $approver, $variant, $unit] = $this->scenario();
        $this->valuationPolicy($chapter, $approver, 'half_up');
        $this->daAuthPolicy($chapter, $approver, ['CHAPTER_HEAD'], ['CHAPTER_HEAD'], true);
        $this->daSeriesPolicy($chapter, $approver);

        $url = "/api/v1/chapters/{$chapter->id}/donations";
        $da1 = $this->createAndAcknowledge($chapter, $preparer, $approver, $variant->id, $unit->id, 'Alpha Relief');
        $da2 = $this->createAndAcknowledge($chapter, $preparer, $approver, $variant->id, $unit->id, 'Beta Relief');

        // Cancel acknowledged DA before any DA-RM posts -> succeeds and keeps reference + acknowledgment
        $this->write($preparer, "$url/$da1/cancel", [
            'expected_version' => 3, 'expected_material_version' => 1, 'reason' => 'Donor withdrew before delivery',
        ])->assertOk()
            ->assertJsonPath('data.result.status', 'canceled')
            ->assertJsonPath('data.result.reference', 'CEBDA-'.now('Asia/Manila')->year.'-000001');

        // Seed a zero-acceptance posted DA-RM for DA2 (DA2 status stays 'acknowledged')
        $location = CatalogueLocation::create([
            'id' => (string) Str::uuid(), 'chapter_id' => $chapter->id, 'code' => 'STK-B', 'name' => 'Receiving Bay',
            'kind' => 'stockroom', 'custodian_id' => $preparer->id, 'state' => 'active', 'material_version' => 1,
        ]);
        DB::table('receiving_reports')->insert([
            'id' => (string) Str::uuid(), 'chapter_id' => $chapter->id, 'status' => 'posted',
            'version' => 1, 'material_version' => 1, 'rm_reference' => 'RM-2026-000001',
            'source_kind' => 'da', 'source_id' => $da2, 'source_reference' => 'CEBDA-2026-000002',
            'source_material_version' => 1, 'location_id' => $location->id, 'prepared_by' => $preparer->id,
            'posted_by' => $preparer->id, 'posted_at' => now('UTC')->format('Y-m-d H:i:s.u'),
            'created_at' => now('UTC')->format('Y-m-d H:i:s.u'), 'updated_at' => now('UTC')->format('Y-m-d H:i:s.u'),
        ]);

        // Cancel MUST be blocked after any posted DA-RM (even zero-acceptance!)
        $this->write($preparer, "$url/$da2/cancel", [
            'expected_version' => 3, 'expected_material_version' => 1, 'reason' => 'Cannot cancel after posted RM',
        ])->assertConflict()->assertJsonPath('error.code', 'invalid_transition');

        // Close-short succeeds on DA2 with outstanding pledge
        $this->write($approver, "$url/$da2/close-short", [
            'expected_version' => 3, 'expected_material_version' => 1, 'reason' => 'Remaining pledge will not arrive',
        ])->assertOk()->assertJsonPath('data.result.status', 'closed_short');

        // q search filtering, eligible_for, pagination & 5-minute snapshot cursor expiry
        $this->asBrowserOfficer($preparer->id)->get("$url?q=beta")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.da_id', $da2);
        $this->asBrowserOfficer($preparer->id)->get("$url?q=%20%20")
            ->assertBadRequest()->assertJsonPath('error.code', 'invalid_selector');

        $page1 = $this->asBrowserOfficer($preparer->id)->get("$url?q=relief&limit=1")
            ->assertOk()->assertJsonCount(1, 'data');
        $cursor = urlencode($page1->json('page.next_cursor'));
        $this->asBrowserOfficer($preparer->id)->get("$url?q=relief&limit=1&cursor=$cursor")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('page.next_cursor', null);

        $this->travel(6)->minutes();
        $this->asBrowserOfficer($preparer->id)->get("$url?q=relief&limit=1&cursor=$cursor")
            ->assertConflict()->assertJsonPath('error.code', 'snapshot_stale');
    }

    /** @return array{Chapter, User, User, CatalogueVariant, CatalogueUnit} */
    private function scenario(): array
    {
        $chapter = Chapter::create(['id' => (string) Str::uuid(), 'code' => 'SYN-DA', 'name' => 'Donation chapter', 'status' => 'live', 'version' => 1]);
        $preparer = $this->officer($chapter, ['INVENTORY']);
        $approver = $this->officer($chapter, ['CHAPTER_HEAD', 'RECEIVING']);
        $unit = CatalogueUnit::create([
            'id' => (string) Str::uuid(), 'chapter_id' => $chapter->id, 'code' => 'KG', 'name' => 'Kilograms',
            'quantity_kind' => 'measured', 'quantity_scale' => 2, 'state' => 'active', 'material_version' => 1,
        ]);
        $item = CatalogueItem::create([
            'id' => (string) Str::uuid(), 'chapter_id' => $chapter->id, 'code' => 'RICE', 'name' => 'Relief Rice',
            'unit_id' => $unit->id, 'state' => 'active', 'is_active' => true, 'material_version' => 1,
        ]);
        $variant = CatalogueVariant::create([
            'id' => (string) Str::uuid(), 'chapter_id' => $chapter->id, 'item_id' => $item->id, 'sku' => 'RICE-5KG',
            'code' => 'RICE-5KG', 'name' => 'Relief Rice 5kg', 'label' => 'Relief Rice 5kg',
            'unit_id' => $unit->id, 'quantity_scale' => 2, 'state' => 'active', 'is_active' => true, 'material_version' => 1,
        ]);

        return [$chapter, $preparer, $approver, $variant, $unit];
    }

    private function officer(Chapter $chapter, array $duties): User
    {
        $id = (string) Str::uuid();
        $user = User::create([
            'id' => $id, 'public_id' => "da-{$id}@example.invalid", 'name' => 'Officer '.substr($id, 0, 6),
            'email' => "da-{$id}@example.invalid", 'password_hash' => Hash::make('Password123!'), 'status' => 'active', 'version' => 1,
        ]);
        $user->memberships()->create([
            'id' => (string) Str::uuid(), 'chapter_id' => $chapter->id, 'membership_status' => 'active', 'version' => 1,
        ]);
        foreach ($duties as $duty) {
            $user->dutyGrants()->create([
                'id' => (string) Str::uuid(), 'chapter_id' => $chapter->id, 'duty_code' => $duty,
                'status' => 'active', 'is_alternate' => false, 'valid_from' => now()->subDay(), 'version' => 1,
            ]);
        }

        return $user;
    }

    private function valuationPolicy(Chapter $chapter, User $approver, string $mode, ?string $aggregateId = null, int $version = 1): PolicyRecord
    {
        return $this->recordPolicy($chapter, $approver, 'valuation_rounding', 'FINANCE', 'OpeningValuationPolicyValue', [
            'currency' => 'PHP',
            'unit_value_scale' => 2,
            'rounding_mode' => $mode,
            'round_at' => 'accepted_line',
            'valuation_basis_reference' => "VAL-{$mode}-v{$version}",
        ], $aggregateId, $version);
    }

    private function daAuthPolicy(Chapter $chapter, User $approver, array $ackDuties, array $resolveDuties, bool $independent): PolicyRecord
    {
        return $this->recordPolicy($chapter, $approver, 'da_authorization', 'CHAPTER_HEAD', 'DaAuthorizationPolicyValue', [
            'acknowledge_duties' => $ackDuties,
            'restriction_resolve_duties' => $resolveDuties,
            'require_preparer_independence' => $independent,
            'require_signed_acknowledgment_evidence' => true,
            'require_signed_resolution_evidence' => true,
        ]);
    }

    private function daSeriesPolicy(Chapter $chapter, User $approver): PolicyRecord
    {
        return $this->recordPolicy($chapter, $approver, 'reference_series', 'CHAPTER_HEAD', 'DaReferenceSeriesPolicyValue', [
            'document_kind' => 'DA',
            'prefix' => 'CEBDA',
            'year_basis' => 'Asia/Manila',
            'sequence_width' => 6,
        ]);
    }

    private function recordPolicy(
        Chapter $chapter,
        User $approver,
        string $code,
        string $owner,
        string $schema,
        array $value,
        ?string $aggregateId = null,
        int $version = 1,
    ): PolicyRecord {
        $id = (string) Str::uuid();
        $aggregate = $aggregateId ?? $id;
        $record = PolicyRecord::create([
            'id' => $id, 'aggregate_id' => $aggregate, 'chapter_id' => $chapter->id,
            'policy_code' => $code, 'policy_version' => $version, 'rules_json' => $value,
            'effective_from' => now()->subMinute(), 'effective_until' => null,
        ]);
        AuditLog::create([
            'chapter_id' => $chapter->id, 'user_id' => $approver->id, 'action' => 'controlled:recordPolicy',
            'entity_type' => 'policy', 'entity_id' => $aggregate,
            'details' => [
                'version' => $version, 'subject_id' => null,
                'value_schema_reference' => '#/components/schemas/'.$schema,
                'value_sha256' => CanonicalJson::sha256($value),
                'approvals' => [['authority' => $owner, 'approver_id' => $approver->id]],
            ],
        ]);

        return $record;
    }

    private function draftPayload(string $variantId, string $unitId, array $overrides = []): array
    {
        return [
            'donor_name' => $overrides['donor_name'] ?? 'Example Community Foundation',
            'lines' => [
                $this->lineInput(
                    $variantId,
                    $unitId,
                    $overrides['pledged_quantity'] ?? '5.00',
                    $overrides['unit_value_php'] ?? '10.00',
                    $overrides['restrictions'] ?? $this->unrestricted(),
                ),
            ],
        ];
    }

    private function lineInput(string $variantId, string $unitId, string $qty, string $unitPhp, array $restrictions): array
    {
        return [
            'variant_id' => $variantId,
            'unit_id' => $unitId,
            'pledged_quantity' => $qty,
            'condition_notes' => 'New sealed packaging',
            'valuation_kind' => 'estimated',
            'unit_value_php' => $unitPhp,
            'valuation_basis' => '2026 chapter comparative valuation table',
            'restrictions' => $restrictions,
        ];
    }

    private function unrestricted(): array
    {
        return [
            'state' => 'unrestricted',
            'allowed_uses' => [],
            'event_ids' => [],
            'requesting_unit_ids' => [],
            'effective_from' => null,
            'effective_until' => null,
            'interpretation_id' => null,
            'source_condition_reference' => null,
        ];
    }

    private function createAndAcknowledge(Chapter $chapter, User $preparer, User $approver, string $variantId, string $unitId, string $donor): string
    {
        $url = "/api/v1/chapters/{$chapter->id}/donations";
        $daId = $this->write($preparer, $url, $this->draftPayload($variantId, $unitId, ['donor_name' => $donor]))
            ->assertCreated()->json('data.result.da_id');
        $this->write($preparer, "$url/$daId/submit", ['expected_version' => 1, 'expected_material_version' => 1])->assertOk();
        $paper = $this->uploadPaper($chapter, $approver, 'da_acknowledgment', $daId);
        $this->write($approver, "$url/$daId/acknowledge", [
            'expected_version' => 2,
            'expected_material_version' => 1,
            'evidence' => $this->byteBinding($paper),
            'signed_at' => now('UTC')->subMinute()->format('Y-m-d\TH:i:s.u\Z'),
            'confirm_paper_matches' => true,
        ])->assertOk();

        return $daId;
    }

    private function uploadPaper(Chapter $chapter, User $actor, string $purpose, string $recordId): array
    {
        return $this->sendRawMultipartPaper(
            "/api/v1/chapters/{$chapter->id}/evidence",
            $actor->id,
            (string) Str::uuid(),
            ['purpose' => $purpose, 'record_id' => $recordId],
            [['filename' => 'signed.pdf', 'media_type' => 'application/pdf', 'bytes' => $this->validPaperPdf()]],
        )->assertCreated()->json('data');
    }

    private function byteBinding(array $evidence): array
    {
        return [
            'evidence_id' => $evidence['evidence_id'],
            'version_id' => $evidence['version_id'],
            'attachments' => array_map(fn (array $att) => [
                'attachment_id' => $att['attachment_id'],
                'sha256' => $att['sha256'],
            ], $evidence['attachments']),
        ];
    }

    private function write(User $actor, string $url, array $body, ?string $key = null): TestResponse
    {
        return $this->asBrowserOfficer($actor->id, $key ?? (string) Str::uuid())->postJson($url, $body);
    }

    private function putWrite(User $actor, string $url, array $body, ?string $key = null): TestResponse
    {
        return $this->asBrowserOfficer($actor->id, $key ?? (string) Str::uuid())->putJson($url, $body);
    }
}
