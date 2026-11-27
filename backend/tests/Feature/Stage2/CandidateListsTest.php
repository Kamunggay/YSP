<?php

namespace Tests\Feature\Stage2;

use App\Models\BrowserSession;
use App\Models\Chapter;
use App\Models\OpeningCount;
use App\Models\OpeningRm;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\TestCase;

class CandidateListsTest extends TestCase
{
    use AuthenticatesBrowserOfficer, RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_officers_candidates_search_distinguishing_context_filters_pagination_and_exclusions(): void
    {
        $chapter = Chapter::create(['code' => 'SYN-CAND-A', 'name' => 'Chapter Alpha']);
        $foreign = Chapter::create(['code' => 'SYN-CAND-B', 'name' => 'Chapter Beta']);
        $unitA = $this->createUnit($chapter->id, 'OPS-A', 'Operations Unit A');
        $unitB = $this->createUnit($chapter->id, 'OPS-B', 'Operations Unit B');
        $endedUnit = $this->createUnit($chapter->id, 'OPS-OLD', 'Ended Unit', ended: true);
        $foreignUnit = $this->createUnit($foreign->id, 'FOR-A', 'Foreign Unit');

        $caller = $this->createOfficer($chapter, ['INVENTORY', 'DISPATCH'], 'Caller Officer', 'caller.alpha@ysp.invalid');
        $mariaUnitA = $this->createOfficer($chapter, [['COMMITTEE_REQUESTER', $unitA]], 'Maria Cruz', 'maria.cruz.ops@ysp.invalid');
        $mariaWide = $this->createOfficer($chapter, ['COMMITTEE_REQUESTER', 'RECEIVING'], 'Maria Cruz', 'maria.cruz.wide@ysp.invalid');
        $ana = $this->createOfficer($chapter, [['COMMITTEE_REQUESTER', $unitB]], 'Ana Reyes', 'ana.reyes@ysp.invalid');

        // Excluded actors: disabled, foreign-chapter, revoked membership, future membership, revoked/expired duties
        $disabled = $this->createOfficer($chapter, ['COMMITTEE_REQUESTER'], 'Maria Cruz Disabled', 'disabled@ysp.invalid', userStatus: 'disabled');
        $foreignOfficer = $this->createOfficer($foreign, ['COMMITTEE_REQUESTER'], 'Maria Cruz Foreign', 'foreign@ysp.invalid');
        $revokedMember = $this->createOfficer($chapter, ['COMMITTEE_REQUESTER'], 'Maria Cruz Revoked', 'revoked.mem@ysp.invalid', membershipStatus: 'revoked');
        $futureMember = $this->createOfficer($chapter, ['COMMITTEE_REQUESTER'], 'Maria Cruz Future', 'future.mem@ysp.invalid', effectiveFrom: now()->addDay());
        $revokedDuty = $this->createOfficer($chapter, [], 'Maria Cruz NoDuty', 'noduty@ysp.invalid');
        $revokedDuty->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => 'COMMITTEE_REQUESTER', 'status' => 'revoked']);
        $revokedDuty->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => 'RECEIVING', 'status' => 'active', 'valid_until' => now()->subMinute()]);

        $base = "/api/v1/chapters/{$chapter->id}/candidates/officers";

        // Multi-page pagination (limit=2) returns only the 4 eligible active officers across 2 pages
        $collected = [];
        $cursor = null;
        $pages = 0;
        do {
            $query = $cursor === null ? '?limit=2' : '?limit=2&cursor='.urlencode($cursor);
            $res = $this->asBrowserOfficer($caller->id)->get($base.$query)
                ->assertOk()
                ->assertHeader('Cache-Control', 'no-store');
            $collected = array_merge($collected, $res->json('data'));
            $cursor = $res->json('page.next_cursor');
            $this->assertGreaterThanOrEqual(1, $res->json('page.snapshot_version'));
            if ($cursor !== null) {
                $this->assertLessThanOrEqual(1024, strlen($cursor));
            }
            $pages++;
        } while ($cursor !== null);

        $this->assertSame(2, $pages);
        $ids = array_column($collected, 'user_id');
        $this->assertSame([$ana->id, $caller->id, $mariaUnitA->id, $mariaWide->id], $ids);
        foreach ([$disabled->id, $foreignOfficer->id, $revokedMember->id, $futureMember->id, $revokedDuty->id] as $excludedId) {
            $this->assertNotContains($excludedId, $ids);
        }

        // Similar-name distinguishing context + duty + requesting_unit_id + exclude_user_id + search q
        $similar = $this->asBrowserOfficer($caller->id)
            ->get($base.'?q=Cruz&duty=COMMITTEE_REQUESTER&requesting_unit_id='.$unitA.'&exclude_user_id='.$caller->id)
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store')
            ->json('data');

        $this->assertCount(2, $similar);
        $this->assertSame($mariaUnitA->id, $similar[0]['user_id']);
        $this->assertSame('maria.cruz.ops@ysp.invalid', $similar[0]['public_id']);
        $this->assertSame('Maria Cruz', $similar[0]['display_name']);
        $this->assertSame(['COMMITTEE_REQUESTER'], $similar[0]['duties']);
        $this->assertSame([$unitA], $similar[0]['unit_ids']);
        $this->assertFalse($similar[0]['has_chapter_wide_scope']);

        $this->assertSame($mariaWide->id, $similar[1]['user_id']);
        $this->assertSame('maria.cruz.wide@ysp.invalid', $similar[1]['public_id']);
        $this->assertSame([], $similar[1]['unit_ids']);
        $this->assertTrue($similar[1]['has_chapter_wide_scope']);

        // Exclude specific user removes them cleanly
        $excludedOne = $this->asBrowserOfficer($caller->id)
            ->get($base.'?q=Cruz&duty=COMMITTEE_REQUESTER&exclude_user_id='.$mariaUnitA->id)
            ->assertOk()->json('data');
        $this->assertSame([$mariaWide->id], array_column($excludedOne, 'user_id'));

        // Empty search result
        $this->asBrowserOfficer($caller->id)->get($base.'?q=NoMatchingOfficer')
            ->assertOk()->assertJsonPath('data', [])->assertJsonPath('page.next_cursor', null);

        // Unknown, ended, or foreign requesting_unit_id -> uniform 404 resource_not_found
        foreach ([(string) Str::uuid(), $endedUnit, $foreignUnit] as $badUnit) {
            $this->asBrowserOfficer($caller->id)->get($base.'?requesting_unit_id='.$badUnit)
                ->assertNotFound()
                ->assertHeader('Cache-Control', 'no-store')
                ->assertJsonPath('error.code', 'resource_not_found');
        }
    }

    public function test_requesting_units_candidates_search_for_duty_pagination_and_exclusions(): void
    {
        $chapter = Chapter::create(['code' => 'SYN-UNIT-A', 'name' => 'Unit Chapter']);
        $foreign = Chapter::create(['code' => 'SYN-UNIT-B', 'name' => 'Foreign Chapter']);
        $unitA = $this->createUnit($chapter->id, 'COM-ALPHA', 'Alpha Committee');
        $unitB = $this->createUnit($chapter->id, 'COM-BETA', 'Beta Committee');
        $legacyUnit = $this->createUnit($chapter->id, null, null);
        $endedUnit = $this->createUnit($chapter->id, 'COM-END', 'Ended Committee', ended: true);
        $foreignUnit = $this->createUnit($foreign->id, 'COM-FOR', 'Foreign Committee');

        $officer = $this->createOfficer($chapter, [['COMMITTEE_REQUESTER', $unitA], 'INVENTORY'], 'Unit Officer', 'unit.officer@ysp.invalid');
        $base = "/api/v1/chapters/{$chapter->id}/candidates/requesting-units";

        // Multi-page pagination across all 3 active chapter units (excludes ended and foreign)
        $page1 = $this->asBrowserOfficer($officer->id)->get($base.'?limit=2')
            ->assertOk()->assertHeader('Cache-Control', 'no-store');
        $cursor = $page1->json('page.next_cursor');
        $this->assertNotNull($cursor);
        $page2 = $this->asBrowserOfficer($officer->id)->get($base.'?limit=2&cursor='.urlencode($cursor))
            ->assertOk()->assertHeader('Cache-Control', 'no-store');
        $this->assertNull($page2->json('page.next_cursor'));

        $all = array_merge($page1->json('data'), $page2->json('data'));
        $unitIds = array_column($all, 'unit_id');
        $this->assertSame([$unitA, $unitB, $legacyUnit], $unitIds);
        $this->assertNotContains($endedUnit, $unitIds);
        $this->assertNotContains($foreignUnit, $unitIds);
        // Legacy unit gets deterministic readable code and name
        $this->assertStringStartsWith('UNIT-', $all[2]['code']);
        $this->assertTrue($all[2]['active']);

        // for_duty narrows strictly to caller's scoped grant for that duty
        $forRequester = $this->asBrowserOfficer($officer->id)->get($base.'?for_duty=COMMITTEE_REQUESTER')
            ->assertOk()->json('data');
        $this->assertSame([$unitA], array_column($forRequester, 'unit_id'));

        // for_duty with chapter-wide duty returns all 3 active chapter units
        $forInventory = $this->asBrowserOfficer($officer->id)->get($base.'?for_duty=INVENTORY')
            ->assertOk()->json('data');
        $this->assertCount(3, $forInventory);

        // for_duty for a duty caller does not hold returns empty list
        $this->asBrowserOfficer($officer->id)->get($base.'?for_duty=PURCHASING')
            ->assertOk()->assertJsonPath('data', []);

        // Search matching on code/name
        $matched = $this->asBrowserOfficer($officer->id)->get($base.'?q=beta')->assertOk()->json('data');
        $this->assertSame([$unitB], array_column($matched, 'unit_id'));

        // Unit-scoped-only active officer (no chapter-wide grants) can still query requesting-units & officers
        $unitOnlyOfficer = $this->createOfficer($chapter, [['COMMITTEE_REQUESTER', $unitA]], 'Unit Only', 'unit.only@ysp.invalid');
        $scopedUnits = $this->asBrowserOfficer($unitOnlyOfficer->id)->get($base.'?for_duty=COMMITTEE_REQUESTER')
            ->assertOk()->assertHeader('Cache-Control', 'no-store')->json('data');
        $this->assertSame([$unitA], array_column($scopedUnits, 'unit_id'));
        $this->asBrowserOfficer($unitOnlyOfficer->id)->get("/api/v1/chapters/{$chapter->id}/candidates/officers")
            ->assertOk()->assertHeader('Cache-Control', 'no-store');
    }

    public function test_evidence_candidates_target_authority_ready_only_search_pagination_and_uniform_404(): void
    {
        Storage::fake('evidence');
        $chapter = Chapter::create(['code' => 'SYN-EVID-A', 'name' => 'Evidence Chapter']);
        $foreign = Chapter::create(['code' => 'SYN-EVID-B', 'name' => 'Foreign Chapter']);

        $receivingOfficer = $this->createOfficer($chapter, ['RECEIVING'], 'Riza Receiver', 'riza.recv@ysp.invalid');
        $inventoryOfficer = $this->createOfficer($chapter, ['INVENTORY', 'RECEIVING'], 'Ivan Inventory', 'ivan.inv@ysp.invalid');
        $headOnly = $this->createOfficer($chapter, ['CHAPTER_HEAD'], 'Hannah Head', 'hannah.head@ysp.invalid');
        $foreignOfficer = $this->createOfficer($foreign, ['RECEIVING'], 'Frank Foreign', 'frank.for@ysp.invalid');

        $repfId = (string) Str::uuid();
        $poId = (string) Str::uuid();
        $poRmId = (string) Str::uuid();
        $daId = (string) Str::uuid();
        $daRmId = (string) Str::uuid();
        $foreignRmId = (string) Str::uuid();
        $locationId = (string) Str::uuid();

        DB::table('repfs')->insert(['id' => $repfId, 'chapter_id' => $chapter->id, 'prepared_by' => $inventoryOfficer->id, 'status' => 'approved']);
        DB::table('purchase_orders')->insert([
            'id' => $poId, 'chapter_id' => $chapter->id, 'repf_id' => $repfId, 'supplier_selection_id' => (string) Str::uuid(),
            'prepared_by' => $inventoryOfficer->id, 'status' => 'issued', 'supplier' => '{}',
            'delivery_location' => 'Main Warehouse', 'expected_delivery_date' => now()->toDateString(),
            'payment_and_delivery_terms' => 'COD', 'total_amount_php' => '100.00',
        ]);
        DB::table('donations')->insert([
            'id' => $daId, 'chapter_id' => $chapter->id, 'prepared_by' => $inventoryOfficer->id, 'status' => 'acknowledged',
            'donor_name' => 'Donor', 'valuation_policy_id' => (string) Str::uuid(), 'valuation_policy_version' => 1,
            'valuation_policy' => '{}', 'pledged_total_value_php' => '100.00',
        ]);
        DB::table('receiving_reports')->insert([
            ['id' => $poRmId, 'chapter_id' => $chapter->id, 'prepared_by' => $receivingOfficer->id, 'status' => 'inspected', 'source_kind' => 'po', 'source_id' => $poId, 'source_reference' => 'PO-1', 'source_material_version' => 1, 'location_id' => $locationId],
            ['id' => $daRmId, 'chapter_id' => $chapter->id, 'prepared_by' => $receivingOfficer->id, 'status' => 'inspected', 'source_kind' => 'da', 'source_id' => $daId, 'source_reference' => 'DA-1', 'source_material_version' => 1, 'location_id' => $locationId],
            ['id' => $foreignRmId, 'chapter_id' => $foreign->id, 'prepared_by' => $foreignOfficer->id, 'status' => 'inspected', 'source_kind' => 'po', 'source_id' => (string) Str::uuid(), 'source_reference' => 'PO-F', 'source_material_version' => 1, 'location_id' => $locationId],
        ]);

        // Stage 1 OpeningRm target
        $openingCount = OpeningCount::create([
            'chapter_id' => $chapter->id, 'status' => 'draft', 'created_by' => $receivingOfficer->id,
            'revision' => 1, 'material_version' => 1,
        ]);
        $openingRm = OpeningRm::create([
            'chapter_id' => $chapter->id, 'ipc_id' => $openingCount->id, 'status' => 'draft',
            'prepared_by' => $receivingOfficer->id, 'revision' => 1, 'material_version' => 1,
            'material' => ['lines' => []],
        ]);

        // Upload 3 ready manifests on $poRmId (one replaced so v2 is current), plus 1 corrupted manifest (must be excluded)
        $uploadUrl = "/api/v1/chapters/{$chapter->id}/evidence";
        $pdf1 = $this->validPaperPdf('DR Page One');
        $pdf2 = $this->validPaperPdf('DR Page Two');
        $pdf2v2 = $this->validPaperPdf('DR Page Two Rescan');
        $pdf3 = $this->validPaperPdf('DR Page Three');

        $baseTime = Carbon::now('UTC')->startOfSecond();
        Carbon::setTestNow($baseTime->copy()->subMinutes(3));
        $e1 = $this->sendRawMultipartPaper($uploadUrl, $receivingOfficer->id, (string) Str::uuid(), ['purpose' => 'po_supplier_dr', 'record_id' => $poRmId], [['filename' => 'dr1.pdf', 'media_type' => 'application/pdf', 'bytes' => $pdf1]])->assertCreated()->json('data');
        Carbon::setTestNow($baseTime->copy()->subMinutes(2));
        $e2 = $this->sendRawMultipartPaper($uploadUrl, $receivingOfficer->id, (string) Str::uuid(), ['purpose' => 'po_supplier_dr', 'record_id' => $poRmId], [['filename' => 'dr2.pdf', 'media_type' => 'application/pdf', 'bytes' => $pdf2]])->assertCreated()->json('data');
        Carbon::setTestNow($baseTime->copy()->subMinute());
        $e2v2 = $this->sendRawMultipartPaper("{$uploadUrl}/{$e2['evidence_id']}/versions", $receivingOfficer->id, (string) Str::uuid(), ['expected_version' => '1', 'reason' => 'Clearer scan'], [['filename' => 'dr2v2.pdf', 'media_type' => 'application/pdf', 'bytes' => $pdf2v2]])->assertCreated()->json('data');
        Carbon::setTestNow($baseTime);
        $e3 = $this->sendRawMultipartPaper($uploadUrl, $inventoryOfficer->id, (string) Str::uuid(), ['purpose' => 'po_supplier_dr', 'record_id' => $poRmId], [['filename' => 'dr3.pdf', 'media_type' => 'application/pdf', 'bytes' => $pdf3]])->assertCreated()->json('data');
        Carbon::setTestNow();

        // Corrupted / missing-file manifest on the same target must be excluded
        [$corruptRecord, $corruptBlob] = $this->storeReadyPaperEvidence($chapter->id, $receivingOfficer->id, 'po_supplier_dr', $poRmId, 'Corrupt');
        Storage::disk('evidence')->delete($corruptBlob->payload_path);

        // Ready Stage 1 opening_receipt evidence
        [$openingEvidence] = $this->storeReadyPaperEvidence($chapter->id, $receivingOfficer->id, 'opening_receipt', $openingRm->id, 'Opening Paper');

        $base = "/api/v1/chapters/{$chapter->id}/candidates/evidence";

        // Multi-page pagination (limit=2) returns only the 3 ready manifests with current version_id
        $p1 = $this->asBrowserOfficer($receivingOfficer->id)->get($base."?purpose=po_supplier_dr&record_id={$poRmId}&limit=2")
            ->assertOk()->assertHeader('Cache-Control', 'no-store');
        $cursor = $p1->json('page.next_cursor');
        $this->assertNotNull($cursor);
        $p2 = $this->asBrowserOfficer($receivingOfficer->id)->get($base."?purpose=po_supplier_dr&record_id={$poRmId}&limit=2&cursor=".urlencode($cursor))
            ->assertOk()->assertHeader('Cache-Control', 'no-store');
        $this->assertNull($p2->json('page.next_cursor'));

        $items = array_merge($p1->json('data'), $p2->json('data'));
        $this->assertCount(3, $items);
        $this->assertSame([$e3['evidence_id'], $e2['evidence_id'], $e1['evidence_id']], array_column($items, 'evidence_id'));
        $this->assertNotContains($corruptRecord->id, array_column($items, 'evidence_id'));
        $this->assertSame($e2v2['version_id'], $items[1]['version_id']);
        $this->assertSame(2, $items[1]['version']);
        $this->assertSame('Clearer scan', $items[1]['replacement_reason']);
        $this->assertSame('ready', $items[1]['technical_state']);
        $this->assertSame(hash('sha256', $pdf2v2), $items[1]['attachments'][0]['sha256']);
        $this->assertSame('Ivan Inventory', $items[0]['uploaded_by_name']);

        // Search by replacement_reason and sha256 prefix
        $byReason = $this->asBrowserOfficer($receivingOfficer->id)->get($base."?purpose=po_supplier_dr&record_id={$poRmId}&q=Clearer")
            ->assertOk()->json('data');
        $this->assertSame([$e2['evidence_id']], array_column($byReason, 'evidence_id'));

        $shaPrefix = substr(hash('sha256', $pdf1), 0, 12);
        $byDigest = $this->asBrowserOfficer($receivingOfficer->id)->get($base."?purpose=po_supplier_dr&record_id={$poRmId}&q={$shaPrefix}")
            ->assertOk()->json('data');
        $this->assertSame([$e1['evidence_id']], array_column($byDigest, 'evidence_id'));

        // Stage 1 target works cleanly for Glenn 2A / Stage 1 handover/opening pickers
        $openingList = $this->asBrowserOfficer($receivingOfficer->id)->get($base."?purpose=opening_receipt&record_id={$openingRm->id}")
            ->assertOk()->json('data');
        $this->assertSame([$openingEvidence->id], array_column($openingList, 'evidence_id'));

        // Uniform 404 for unknown target, foreign target, wrong source_kind, or lacking target read authority
        foreach ([
            ['po_supplier_dr', (string) Str::uuid()],
            ['po_supplier_dr', $foreignRmId],
            ['po_supplier_dr', $daRmId],
            ['quotation_attachment', $repfId], // RECEIVING has evidence.read but lacks quotation.read
        ] as [$purpose, $targetId]) {
            $this->asBrowserOfficer($receivingOfficer->id)->get($base."?purpose={$purpose}&record_id={$targetId}")
                ->assertNotFound()
                ->assertHeader('Cache-Control', 'no-store')
                ->assertJsonPath('error.code', 'resource_not_found');
        }

        // Lacking evidence.read -> 403 duty_denied
        $this->asBrowserOfficer($headOnly->id)->get($base."?purpose=po_supplier_dr&record_id={$poRmId}")
            ->assertForbidden()
            ->assertHeader('Cache-Control', 'no-store')
            ->assertJsonPath('error.code', 'duty_denied');
    }

    public function test_events_candidates_search_status_pagination_and_exclusions(): void
    {
        $chapter = Chapter::create(['code' => 'SYN-EVT-A', 'name' => 'Event Chapter']);
        $foreign = Chapter::create(['code' => 'SYN-EVT-B', 'name' => 'Foreign Event Chapter']);
        $officer = $this->createOfficer($chapter, ['INVENTORY'], 'Event Officer', 'event.officer@ysp.invalid');

        $eActive1 = (string) Str::uuid();
        $eActive2 = (string) Str::uuid();
        $ePlanned = (string) Str::uuid();
        $eCanceled = (string) Str::uuid();
        $eClosed = (string) Str::uuid();
        $eForeign = (string) Str::uuid();

        DB::table('chapter_events')->insert([
            ['id' => $eActive1, 'chapter_id' => $chapter->id, 'code' => 'EVT-2026-001', 'name' => 'Youth Summit North', 'status' => 'active', 'starts_at' => '2026-12-01 00:00:00.000000', 'ends_at' => '2026-12-02 12:00:00.000000'],
            ['id' => $eActive2, 'chapter_id' => $chapter->id, 'code' => 'EVT-2026-002', 'name' => 'Youth Summit South', 'status' => 'active', 'starts_at' => '2026-12-05 00:00:00.000000', 'ends_at' => '2026-12-06 12:00:00.000000'],
            ['id' => $ePlanned, 'chapter_id' => $chapter->id, 'code' => 'EVT-2026-003', 'name' => 'Community Drive', 'status' => 'planned', 'starts_at' => null, 'ends_at' => null],
            ['id' => $eCanceled, 'chapter_id' => $chapter->id, 'code' => 'EVT-2026-OLD', 'name' => 'Youth Summit Canceled', 'status' => 'canceled', 'starts_at' => '2026-12-03 00:00:00.000000', 'ends_at' => null],
            ['id' => $eClosed, 'chapter_id' => $chapter->id, 'code' => 'EVT-2025-END', 'name' => 'Closed Summit', 'status' => 'closed', 'starts_at' => '2025-12-01 00:00:00.000000', 'ends_at' => null],
            ['id' => $eForeign, 'chapter_id' => $foreign->id, 'code' => 'EVT-2026-FOR', 'name' => 'Youth Summit Foreign', 'status' => 'active', 'starts_at' => '2026-12-01 00:00:00.000000', 'ends_at' => null],
        ]);

        $base = "/api/v1/chapters/{$chapter->id}/candidates/events";

        // Multi-page pagination excludes canceled, closed, and foreign events
        $p1 = $this->asBrowserOfficer($officer->id)->get($base.'?limit=2')
            ->assertOk()->assertHeader('Cache-Control', 'no-store');
        $cursor = $p1->json('page.next_cursor');
        $this->assertNotNull($cursor);
        $p2 = $this->asBrowserOfficer($officer->id)->get($base.'?limit=2&cursor='.urlencode($cursor))
            ->assertOk()->assertHeader('Cache-Control', 'no-store');
        $this->assertNull($p2->json('page.next_cursor'));

        $all = array_merge($p1->json('data'), $p2->json('data'));
        $ids = array_column($all, 'event_id');
        $this->assertSame([$eActive1, $eActive2, $ePlanned], $ids);
        $this->assertSame('2026-12-01T00:00:00.000000Z', $all[0]['starts_at']);
        $this->assertNull($all[2]['starts_at']);

        // Status filter + search
        $summits = $this->asBrowserOfficer($officer->id)->get($base.'?q=Summit&status=active')->assertOk()->json('data');
        $this->assertSame([$eActive1, $eActive2], array_column($summits, 'event_id'));

        $planned = $this->asBrowserOfficer($officer->id)->get($base.'?status=planned')->assertOk()->json('data');
        $this->assertSame([$ePlanned], array_column($planned, 'event_id'));

        // Disallowed status selector rejected with 400 invalid_selector
        $this->asBrowserOfficer($officer->id)->get($base.'?status=canceled')
            ->assertStatus(400)->assertJsonPath('error.code', 'invalid_selector');
    }

    public function test_candidate_endpoints_enforce_session_mfa_selectors_snapshot_invalidation_and_immediate_revocation(): void
    {
        $chapter = Chapter::create(['code' => 'SYN-SEC-A', 'name' => 'Security Chapter']);
        $otherChapter = Chapter::create(['code' => 'SYN-SEC-B', 'name' => 'Other Chapter']);
        $caller = $this->createOfficer($chapter, ['INVENTORY', 'RECEIVING'], 'Security Caller', 'sec.caller@ysp.invalid');
        $peerA = $this->createOfficer($chapter, ['INVENTORY'], 'Peer Alpha', 'peer.a@ysp.invalid');
        $peerB = $this->createOfficer($chapter, ['INVENTORY'], 'Peer Beta', 'peer.b@ysp.invalid');

        $officersUrl = "/api/v1/chapters/{$chapter->id}/candidates/officers";
        $unitsUrl = "/api/v1/chapters/{$chapter->id}/candidates/requesting-units";
        $eventsUrl = "/api/v1/chapters/{$chapter->id}/candidates/events";
        $evidenceUrl = "/api/v1/chapters/{$chapter->id}/candidates/evidence";

        // 1. Unauthenticated -> 401
        $this->asGuest()->get($officersUrl, ['Accept' => 'application/json'])
            ->assertUnauthorized()->assertHeader('Cache-Control', 'no-store')->assertJsonPath('error.code', 'unauthenticated');

        // 2. MFA incomplete -> 403 mfa_incomplete
        config(['app.url' => $this->browserOrigin]);
        app('url')->useOrigin($this->browserOrigin);
        app('url')->forceScheme('https');
        $limited = new BrowserSession([
            'user_id' => $caller->id, 'user_version' => $caller->fresh()->version, 'next_step' => 'authenticator_challenge',
            'authenticated_at' => now(), 'expires_at' => now()->addHour(),
        ]);
        $limitedToken = $limited->rotateToken();
        $limited->save();
        $this->flushHeaders()->withCredentials()->withUnencryptedCookie('ysp_session', $limitedToken)
            ->withHeaders(['Accept' => 'application/json', 'Origin' => $this->browserOrigin])
            ->get($officersUrl)
            ->assertForbidden()->assertHeader('Cache-Control', 'no-store')->assertJsonPath('error.code', 'mfa_incomplete');

        // 3. Foreign chapter -> 404 chapter_not_found
        $this->asBrowserOfficer($caller->id)->get("/api/v1/chapters/{$otherChapter->id}/candidates/officers")
            ->assertNotFound()->assertHeader('Cache-Control', 'no-store')->assertJsonPath('error.code', 'chapter_not_found');

        // 4. Bodyless GET rejection, X-Action-Key rejection, unknown/repeated/percent-encoded/malformed selectors -> 400 invalid_selector
        $this->asBrowserOfficer($caller->id)
            ->call('GET', $officersUrl, [], ['ysp_session' => $this->browserSessionFor($caller->id)['token']], [], ['HTTP_ACCEPT' => 'application/json', 'HTTP_ORIGIN' => $this->browserOrigin], '{"bad":true}')
            ->assertStatus(400)->assertHeader('Cache-Control', 'no-store')->assertJsonPath('error.code', 'invalid_selector');

        $this->asBrowserOfficer($caller->id, (string) Str::uuid())->get($officersUrl)
            ->assertStatus(400)->assertJsonPath('error.code', 'invalid_selector');

        foreach ([
            $officersUrl.'?unknown=1',
            $officersUrl.'?limit=2&limit=2',
            $officersUrl.'?%71=Peer',
            $officersUrl.'?q=',
            $officersUrl.'?q=%20%20',
            $officersUrl.'?q=%09',
            $officersUrl.'?limit=0',
            $officersUrl.'?limit=101',
            $officersUrl.'?duty=NOT_A_DUTY',
            $officersUrl.'?cursor=not-a-valid-cursor',
            $evidenceUrl.'?purpose=po_supplier_dr', // missing record_id
            $evidenceUrl.'?purpose=invalid&record_id='.(string) Str::uuid(),
            '/api/v1/chapters/not-a-uuid/candidates/evidence?purpose=po_supplier_dr&record_id='.(string) Str::uuid(),
        ] as $badUrl) {
            $this->asBrowserOfficer($caller->id)->get($badUrl)
                ->assertStatus(400)->assertHeader('Cache-Control', 'no-store')->assertJsonPath('error.code', 'invalid_selector');
        }

        // 5. Cursor scope binding (wrong endpoint / wrong limit / wrong user -> 400 invalid_selector)
        $page1 = $this->asBrowserOfficer($caller->id)->get($officersUrl.'?limit=1')->assertOk();
        $cursor = $page1->json('page.next_cursor');
        $this->assertNotNull($cursor);

        $this->asBrowserOfficer($caller->id)->get($unitsUrl.'?limit=1&cursor='.urlencode($cursor))
            ->assertStatus(400)->assertJsonPath('error.code', 'invalid_selector');
        $this->asBrowserOfficer($caller->id)->get($officersUrl.'?limit=2&cursor='.urlencode($cursor))
            ->assertStatus(400)->assertJsonPath('error.code', 'invalid_selector');
        $this->asBrowserOfficer($peerA->id)->get($officersUrl.'?limit=1&cursor='.urlencode($cursor))
            ->assertStatus(400)->assertJsonPath('error.code', 'invalid_selector');

        // 6. Snapshot invalidation on underlying candidate change -> 409 snapshot_stale
        $peerB->update(['name' => 'Peer Beta Renamed']);
        $this->asBrowserOfficer($caller->id)->get($officersUrl.'?limit=1&cursor='.urlencode($cursor))
            ->assertConflict()->assertHeader('Cache-Control', 'no-store')->assertJsonPath('error.code', 'snapshot_stale');

        // 7. Snapshot invalidation on caller authority version change -> 409 snapshot_stale
        $freshCursor = $this->asBrowserOfficer($caller->id)->get($officersUrl.'?limit=1')->assertOk()->json('page.next_cursor');
        $caller->memberships()->where('chapter_id', $chapter->id)->increment('version');
        $this->asBrowserOfficer($caller->id)->get($officersUrl.'?limit=1&cursor='.urlencode($freshCursor))
            ->assertConflict()->assertJsonPath('error.code', 'snapshot_stale');

        // 7b. Snapshot invalidation on clock-based grant expiry without a version bump -> 409 snapshot_stale
        $caller->dutyGrants()->where('chapter_id', $chapter->id)->where('duty_code', 'RECEIVING')
            ->update(['valid_until' => now()->addSeconds(30)]);
        $expiryAwareCursor = $this->asBrowserOfficer($caller->id)->get($officersUrl.'?limit=1')->assertOk()->json('page.next_cursor');
        Carbon::setTestNow(now()->addSeconds(45));
        $this->asBrowserOfficer($caller->id)->get($officersUrl.'?limit=1&cursor='.urlencode($expiryAwareCursor))
            ->assertConflict()->assertJsonPath('error.code', 'snapshot_stale');
        Carbon::setTestNow();

        // 8. Snapshot invalidation after 5-minute window expires -> 409 snapshot_stale
        $expiringCursor = $this->asBrowserOfficer($caller->id)->get($officersUrl.'?limit=1')->assertOk()->json('page.next_cursor');
        Carbon::setTestNow(now()->addMinutes(5)->addSecond());
        $this->asBrowserOfficer($caller->id)->get($officersUrl.'?limit=1&cursor='.urlencode($expiringCursor))
            ->assertConflict()->assertJsonPath('error.code', 'snapshot_stale');
        Carbon::setTestNow();

        // 9. Immediate denial after duty revocation -> 403 duty_denied
        $caller->dutyGrants()->where('chapter_id', $chapter->id)->update(['status' => 'revoked']);
        foreach ([
            $officersUrl,
            $unitsUrl,
            $eventsUrl,
            $evidenceUrl.'?purpose=po_supplier_dr&record_id='.(string) Str::uuid(),
        ] as $url) {
            $this->asBrowserOfficer($caller->id)->get($url)
                ->assertForbidden()->assertHeader('Cache-Control', 'no-store')->assertJsonPath('error.code', 'duty_denied');
        }

        // 10. Immediate denial after chapter membership revocation -> 404 chapter_not_found
        $caller->memberships()->where('chapter_id', $chapter->id)->update(['membership_status' => 'revoked']);
        $this->asBrowserOfficer($caller->id)->get($officersUrl)
            ->assertNotFound()->assertHeader('Cache-Control', 'no-store')->assertJsonPath('error.code', 'chapter_not_found');
    }

    /** @param list<string|array{0: string, 1: string}> $duties */
    private function createOfficer(
        Chapter $chapter,
        array $duties,
        string $name,
        string $publicId,
        string $userStatus = 'active',
        string $membershipStatus = 'active',
        ?Carbon $effectiveFrom = null,
    ): User {
        $user = User::create([
            'name' => $name,
            'public_id' => $publicId,
            'email' => $publicId,
            'password_hash' => Hash::make('Synthetic test credential'),
            'status' => $userStatus,
        ]);
        $user->memberships()->create([
            'chapter_id' => $chapter->id,
            'membership_status' => $membershipStatus,
            'effective_from' => $effectiveFrom,
        ]);
        foreach ($duties as $duty) {
            [$code, $unitId] = is_array($duty) ? $duty : [$duty, null];
            $user->dutyGrants()->create([
                'chapter_id' => $chapter->id,
                'duty_code' => $code,
                'status' => 'active',
                'is_alternate' => false,
                'scope' => $unitId === null ? null : ['unit_id' => $unitId],
                'valid_from' => now()->subDay(),
            ]);
        }

        return $user;
    }

    private function createUnit(string $chapterId, ?string $code, ?string $name, bool $ended = false): string
    {
        $id = (string) Str::uuid();
        DB::table('chapter_organizational_units')->insert([
            'id' => $id,
            'chapter_id' => $chapterId,
            'code' => $code,
            'name' => $name,
            'ended_at' => $ended ? now()->subMinute() : null,
        ]);

        return $id;
    }
}
