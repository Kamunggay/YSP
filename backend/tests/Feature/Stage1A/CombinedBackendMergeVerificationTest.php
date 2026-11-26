<?php

namespace Tests\Feature\Stage1A;

use App\Models\AuditLog;
use App\Models\BrowserSession;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DomainNotificationOutbox;
use App\Models\DutyGrant;
use App\Models\PolicyRecord;
use App\Models\User;
use App\Services\Notifications\NotificationSubjectRead;
use App\Services\Shared\CanonicalJson;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class CombinedBackendMergeVerificationTest extends TestCase
{
    use RefreshDatabase;

    private const ALLOWED_EXTRA_ROUTES = [
        'GET /api/v1/chapters/{}/buyers',
        'POST /api/v1/chapters/{}/buyers',
        'GET /api/v1/chapters/{}/handovers',
        'POST /api/v1/chapters/{}/handovers',
        'GET /api/v1/chapters/{}/handovers/{}',
        'GET /api/v1/chapters/{}/operations/by-idempotency-key/{}',
        'GET /api/v1/chapters/{}/sales-orders',
        'POST /api/v1/chapters/{}/sales-orders',
        'GET /api/v1/chapters/{}/sales-orders/{}',
        'POST /api/v1/chapters/{}/sales-orders/{}/cancel',
        'GET /api/v1/chapters/{}/sales-orders/{}/print',
        'POST /api/v1/chapters/{}/sales-orders/{}/review',
        'POST /api/v1/chapters/{}/sales-orders/{}/revise',
        'POST /api/v1/chapters/{}/sales-orders/{}/submit',
        'POST /api/v1/chapters/{}/sales-orders/{}/acceptance',
        'POST /api/v1/chapters/{}/sales-orders/{}/contact-logs',
        'POST /api/v1/chapters/{}/sales-orders/{}/split-demand',
        'GET /api/v1/handovers',
        'POST /api/v1/handovers',
        'GET /api/v1/handovers/{}',
        'GET /api/v1/operations/by-idempotency-key/{}',
    ];

    private string $origin = 'https://merge.example.invalid';

    private string $chapterId;

    private string $requestingUnitId;

    private string $custodianId;

    private string $receiverId;

    private string $headId;

    private string $financeId;

    private string $requesterId;

    private string $approverId;

    private string $approverGrantId;

    private string $unitId;

    private string $itemId;

    private string $variantId;

    private string $locationId;

    private string $cutoffAt = '2026-11-01T00:00:00.000000Z';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('evidence');
    }

    public function test_locked_stage1_openapi_operations_are_registered_with_only_allowed_extra_routes(): void
    {
        $specPath = realpath(base_path('../contracts/stage1/openapi.yaml'));
        if ($specPath === false || ! is_file($specPath)) {
            if (getenv('OPENAPI_REQUIRE_SPEC') === '1') {
                $this->fail('Locked Stage 1 OpenAPI file is required when OPENAPI_REQUIRE_SPEC=1.');
            }
            $this->markTestSkipped('Locked Stage 1 OpenAPI file is not mounted in this container.');
        }

        $locked = [];
        $inPaths = false;
        $currentPath = null;
        foreach (file($specPath, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
            if (preg_match('/^paths:\s*$/', $line)) {
                $inPaths = true;

                continue;
            }
            if ($inPaths && preg_match('/^[A-Za-z0-9_-]+:/', $line)) {
                $inPaths = false;

                continue;
            }
            if (! $inPaths) {
                continue;
            }
            if (preg_match('/^  (\/\S+):\s*$/', $line, $match)) {
                $currentPath = $match[1];

                continue;
            }
            if ($currentPath !== null && preg_match('/^    (get|post|put|patch|delete):\s*$/', $line, $match)) {
                $key = strtoupper($match[1]).' '.preg_replace('/\{[^}]+\}/', '{}', $currentPath);
                $locked[$key] = strtoupper($match[1]).' '.$currentPath;
            }
        }

        $registered = [];
        foreach (Route::getRoutes() as $route) {
            $uri = '/'.ltrim($route->uri(), '/');
            if (! str_starts_with($uri, '/api/')) {
                continue;
            }
            $normalized = preg_replace('/\{[^}]+\}/', '{}', $uri);
            foreach ($route->methods() as $method) {
                if ($method === 'HEAD') {
                    continue;
                }
                $registered[$method.' '.$normalized] = $method.' '.$uri;
            }
        }

        $this->assertCount(126, $locked);
        $this->assertSame([], array_diff_key($locked, $registered), 'Missing locked Stage 1 OpenAPI operations.');

        $extra = array_keys(array_diff_key($registered, $locked));
        sort($extra);
        $allowed = self::ALLOWED_EXTRA_ROUTES;
        sort($allowed);
        $this->assertSame($allowed, $extra);
    }

    public function test_connected_journey_from_approved_ipc_and_opening_rm_to_stock_rf_reservation_and_signed_actual_issue(): void
    {
        $this->seedConnectedChapterFixture();
        $openingPolicies = $this->seedEffectivePolicies();

        // 1. IPC draft -> independent counts -> submit -> Head & Finance authorize
        $lineUsable = (string) Str::uuid();
        $lineDamaged = (string) Str::uuid();
        $lineRejected = (string) Str::uuid();
        $ipcLines = [
            $this->makeIpcLine($lineUsable, 'usable', '12'),
            $this->makeIpcLine($lineDamaged, 'damaged', '2'),
            $this->makeIpcLine($lineRejected, 'rejected', '1'),
        ];

        $ipcRes = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs", [
                'material' => [
                    'cutoff_at' => $this->cutoffAt,
                    'informal_movements_suspended' => true,
                    'count_team' => [
                        ['user_id' => $this->custodianId, 'regular_custodian' => true],
                        ['user_id' => $this->receiverId, 'regular_custodian' => false],
                    ],
                    'policies' => $openingPolicies,
                    'lines' => $ipcLines,
                    'notes' => 'Connected Stage 1 opening count',
                ],
            ])->assertStatus(201);
        $ipcId = $ipcRes->json('data.record.id');

        $rmRes = $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms", [
                'ipc_id' => $ipcId,
                'material' => ['ipc_material_version' => 1, 'lines' => [], 'notes' => null],
            ])->assertStatus(201);
        $rmId = $rmRes->json('data.record.id');

        $countedAt = now('UTC')->subMinutes(4)->format('Y-m-d\TH:i:s.u\Z');
        $entries = array_map(fn (array $l) => [
            'ipc_line_id' => $l['line_id'],
            'quantity' => $l['counted_quantity'],
            'condition' => $l['condition'],
            'notes' => null,
        ], $ipcLines);

        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 1,
                'material_version' => 1,
                'counted_at' => $countedAt,
                'completed' => true,
                'signed_at' => $countedAt,
                'entries' => $entries,
            ])->assertStatus(200);

        $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 2,
                'material_version' => 1,
                'counted_at' => $countedAt,
                'completed' => true,
                'signed_at' => $countedAt,
                'entries' => $entries,
            ])->assertStatus(200);

        $signedIpc = $this->uploadPaper($this->receiverId, 'opening_receipt', $rmId, (string) Str::uuid())
            ->assertStatus(201)
            ->json('data');

        $submittedIpc = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit", [
                'expected_revision' => 3,
                'material_version' => 1,
                'signed_ipc' => $this->byteBinding($signedIpc),
            ])->assertStatus(200);
        $ipcRef = $submittedIpc->json('data.record.reference');
        $this->assertNotEmpty($ipcRef);

        $authSignedAt = now('UTC')->subMinutes(3)->format('Y-m-d\TH:i:s.u\Z');
        $authHead = $this->asOfficer($this->headId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => $submittedIpc->json('data.record.revision'),
                'material_version' => 1,
                'duty' => 'CHAPTER_HEAD',
                'signed_at' => $authSignedAt,
            ])->assertStatus(200);

        $authFin = $this->asOfficer($this->financeId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => $authHead->json('data.record.revision'),
                'material_version' => 1,
                'duty' => 'FINANCE',
                'signed_at' => $authSignedAt,
            ])->assertStatus(200);
        $this->assertSame('authorized', $authFin->json('data.record.state'));

        // 2. Opening RM -> populate lines (12 accepted, 2 damaged, 1 rejected) -> inspect -> paper evidence -> match -> post
        $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}", [
                'expected_revision' => 1,
                'reason' => 'Populate inspected Opening RM lines',
                'material' => [
                    'ipc_material_version' => 1,
                    'lines' => [
                        ['ipc_line_id' => $lineUsable, 'accepted_quantity' => '12', 'damaged_quantity' => '0', 'rejected_quantity' => '0', 'accepted_value' => '300.00', 'finding_reason' => null],
                        ['ipc_line_id' => $lineDamaged, 'accepted_quantity' => '0', 'damaged_quantity' => '2', 'rejected_quantity' => '0', 'accepted_value' => '0.00', 'finding_reason' => '2 torn collars'],
                        ['ipc_line_id' => $lineRejected, 'accepted_quantity' => '0', 'damaged_quantity' => '0', 'rejected_quantity' => '1', 'accepted_value' => '0.00', 'finding_reason' => '1 wrong print'],
                    ],
                    'notes' => 'Connected Opening RM',
                ],
            ])->assertStatus(200);

        $inspectedRm = $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/inspection", [
                'expected_revision' => 2,
                'ipc_material_version' => 1,
                'inspected_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'technical_representative_id' => null,
                'inspection_notes' => 'Inspected at receiving table',
            ])->assertStatus(200);

        $rmPaper = $this->uploadPaper($this->receiverId, 'opening_receipt', $rmId, (string) Str::uuid())
            ->assertStatus(201)
            ->json('data');

        $matchedRm = $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/evidence-match", [
                'expected_revision' => $inspectedRm->json('data.record.revision'),
                'material_version' => 2,
                'snapshot_sha256' => $inspectedRm->json('data.record.snapshot_sha256'),
                'bytes' => $this->byteBinding($rmPaper),
                'acknowledged_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
            ])->assertStatus(200);

        $postRmKey = (string) Str::uuid();
        $postRmPayload = [
            'expected_revision' => $matchedRm->json('data.record.revision'),
            'material_version' => 2,
            'ipc_material_version' => 1,
            'acknowledgment_id' => $matchedRm->json('data.record.acknowledgment.acknowledgment_id'),
        ];
        $postedRm = $this->asOfficer($this->receiverId, $postRmKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/post", $postRmPayload)
            ->assertStatus(200)
            ->assertHeader('X-Action-Replayed', 'false');
        $rmRef = $postedRm->json('data.record.reference');
        $this->assertSame('posted', $postedRm->json('data.record.state'));
        $this->assertNotEmpty($rmRef);

        // Reconcile opening baseline, movements, and findings
        $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-baseline")
            ->assertStatus(200)
            ->assertJsonPath('data.rm_id', $rmId)
            ->assertJsonPath('data.ipc_id', $ipcId)
            ->assertJsonPath('data.accepted_value', '300.00');

        $rmMovements = $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/movements")
            ->assertStatus(200);
        $this->assertCount(1, $rmMovements->json('data'));
        $this->assertSame('12', $rmMovements->json('data.0.quantity'));
        $openingLotId = $rmMovements->json('data.0.lot_id');

        $rmFindings = $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/findings")
            ->assertStatus(200);
        $this->assertCount(2, $rmFindings->json('data'));

        // 3. Glenn's stock views & stock lots reconcile to accepted opening stock
        $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/stock/variants/{$this->variantId}")
            ->assertStatus(200)
            ->assertJsonPath('data.views.usable_stockroom_on_hand.quantity', '12')
            ->assertJsonPath('data.views.available_to_allocate.quantity', '12')
            ->assertJsonPath('data.views.rf_reserved.quantity', '0')
            ->assertJsonPath('data.views.quarantined_rejected.quantity', '3');

        $lotsRes = $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/stock/lots?variant_id={$this->variantId}")
            ->assertStatus(200);
        $usableLot = collect($lotsRes->json('data'))->firstWhere('id', $openingLotId);
        $this->assertNotNull($usableLot);
        $basisSegmentId = $usableLot['basis_segment_id'];
        $this->assertNotEmpty($basisSegmentId);

        // 4. Glenn's Internal RF: requester drafts & submits -> separate approver approves
        $rfCreate = $this->asOfficer($this->requesterId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs", [
                'purpose' => 'internal_use',
                'requesting_unit_id' => $this->requestingUnitId,
                'justification' => 'Chapter outreach kit distribution',
                'needed_at' => now('UTC')->addDays(2)->format('Y-m-d\TH:i:s.u\Z'),
                'lines' => [[
                    'variant_id' => $this->variantId,
                    'unit_id' => $this->unitId,
                    'requested_quantity' => '10',
                ]],
            ])->assertStatus(201);
        $rfId = $rfCreate->json('data.result.id');
        $rfLineId = $rfCreate->json('data.result.lines.0.id');

        $rfSubmit = $this->asOfficer($this->requesterId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/submit", [
                'expected_version' => 1,
                'expected_material_version' => 1,
            ])->assertStatus(200);
        $this->assertSame('submitted', $rfSubmit->json('data.result.status'));
        $this->assertNotEmpty($rfSubmit->json('data.result.reference'));

        $rfApprove = $this->asOfficer($this->approverId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/approve", [
                'expected_version' => $rfSubmit->json('data.result.version'),
                'expected_material_version' => $rfSubmit->json('data.result.material_version'),
            ])->assertStatus(200);
        $this->assertSame('approved', $rfApprove->json('data.result.status'));
        $this->assertSame('outstanding', $rfApprove->json('data.result.fulfillment'));

        // 5. Glenn's exact reservation against the posted Opening RM lot
        $prepRes = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations", [
                'rf_line_id' => $rfLineId,
                'expected_rf_version' => $rfApprove->json('data.result.version'),
                'expected_rf_material_version' => $rfApprove->json('data.result.material_version'),
                'expected_rf_progress_version' => $rfApprove->json('data.result.progress_version'),
                'targets' => [[
                    'stock_lot_id' => $openingLotId,
                    'basis_segment_id' => $basisSegmentId,
                    'offset_quantity' => '0',
                    'quantity' => '10',
                    'expected_lot_material_version' => $usableLot['material_version'],
                    'expected_stock_version' => $usableLot['stock_version'],
                ]],
            ])->assertStatus(201);
        $prepId = $prepRes->json('data.result.id');

        $commitRes = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/reservation-preparations/{$prepId}/commit", [
                'expected_preparation_version' => 1,
                'expected_rf_version' => $rfApprove->json('data.result.version'),
                'expected_rf_material_version' => $rfApprove->json('data.result.material_version'),
                'expected_rf_progress_version' => $rfApprove->json('data.result.progress_version'),
            ])->assertStatus(201);
        $reservationId = $commitRes->json('data.result.id');
        $reservationVersion = $commitRes->json('data.result.version');
        $reservationMaterialVersion = $commitRes->json('data.result.material_version');

        $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/stock/variants/{$this->variantId}")
            ->assertStatus(200)
            ->assertJsonPath('data.views.usable_stockroom_on_hand.quantity', '12')
            ->assertJsonPath('data.views.available_to_allocate.quantity', '2')
            ->assertJsonPath('data.views.rf_reserved.quantity', '10')
            ->assertJsonPath('data.views.quarantined_rejected.quantity', '3');

        $rfAfterReserve = $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}")
            ->assertStatus(200);
        $this->assertSame('10', $rfAfterReserve->json('data.lines.0.progress.reserved_quantity'));
        $this->assertSame('0', $rfAfterReserve->json('data.lines.0.progress.issued_quantity'));
        $this->assertSame('10', $rfAfterReserve->json('data.lines.0.progress.remaining_quantity'));
        $this->assertSame('0', $rfAfterReserve->json('data.lines.0.progress.unreserved_quantity'));

        // 6. Efren's signed actual issue + Leader's paper evidence binding (partial 6 of 10 reserved)
        $handedOverAt = now('UTC')->subMinutes(2)->format('Y-m-d\TH:i:s.u\Z');
        $acknowledgedAt = now('UTC')->subMinute()->format('Y-m-d\TH:i:s.u\Z');
        $prepareIssue = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/actual-issues", [
                'expected_rf_version' => $rfAfterReserve->json('data.version'),
                'expected_rf_material_version' => $rfAfterReserve->json('data.material_version'),
                'expected_rf_progress_version' => $rfAfterReserve->json('data.progress_version'),
                'recipient_id' => $this->requesterId,
                'recipient_name' => 'Committee Requester',
                'handed_over_at' => $handedOverAt,
                'acknowledged_at' => $acknowledgedAt,
                'recipient_accepts_partial' => true,
                'lines' => [[
                    'rf_line_id' => $rfLineId,
                    'reservation_id' => $reservationId,
                    'expected_reservation_version' => $reservationVersion,
                    'expected_reservation_material_version' => $reservationMaterialVersion,
                    'targets' => [[
                        'stock_lot_id' => $openingLotId,
                        'basis_segment_id' => $basisSegmentId,
                        'offset_quantity' => '0',
                        'quantity' => '6',
                    ]],
                ]],
            ])->assertStatus(201);
        $issueId = $prepareIssue->json('data.id');
        $issueSnapshot = $prepareIssue->json('data.snapshot');
        $this->assertNotEmpty($issueSnapshot['sha256'] ?? null);

        $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issueId}/print")
            ->assertStatus(200)
            ->assertHeader('Cache-Control', 'no-store');

        $issuePaper = $this->uploadPaper($this->custodianId, 'actual_issue', $issueId, (string) Str::uuid())
            ->assertStatus(201)
            ->json('data');

        $ackRes = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issueId}/acknowledgments", [
                'expected_version' => $prepareIssue->json('data.version'),
                'expected_material_version' => $prepareIssue->json('data.material_version'),
                'expected_snapshot' => $issueSnapshot,
                'evidence' => $this->byteBinding($issuePaper),
                'matches_paper' => true,
            ])->assertStatus(200);
        $issueAckId = $ackRes->json('data.result.acknowledgment.acknowledgment_id');
        $this->assertNotEmpty($issueAckId);

        $postIssueKey = (string) Str::uuid();
        $postIssuePayload = [
            'expected_version' => $ackRes->json('data.result.version'),
            'expected_material_version' => $ackRes->json('data.result.material_version'),
            'expected_rf_version' => $rfAfterReserve->json('data.version'),
            'expected_rf_material_version' => $rfAfterReserve->json('data.material_version'),
            'expected_rf_progress_version' => $rfAfterReserve->json('data.progress_version'),
            'acknowledgment_id' => $issueAckId,
            'current_sources' => [[
                'reservation_id' => $reservationId,
                'expected_version' => $reservationVersion,
                'expected_material_version' => $reservationMaterialVersion,
                'targets' => [[
                    'stock_lot_id' => $openingLotId,
                    'expected_lot_material_version' => $usableLot['material_version'],
                    'expected_stock_version' => $usableLot['stock_version'],
                ]],
            ]],
        ];
        $postedIssue = $this->asOfficer($this->custodianId, $postIssueKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issueId}/post", $postIssuePayload)
            ->assertStatus(200)
            ->assertHeader('X-Action-Replayed', 'false');
        $this->assertSame('posted', $postedIssue->json('data.result.status'));

        // Exact authorized replay succeeds before authority revocation
        $this->asOfficer($this->custodianId, $postIssueKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issueId}/post", $postIssuePayload)
            ->assertStatus(200)
            ->assertHeader('X-Action-Replayed', 'true')
            ->assertJsonPath('data.operation_id', $postedIssue->json('data.operation_id'));

        // 7. Reconcile source, movement, related records, stock, RF progress, and outbox
        $issueRelated = $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issueId}/related")
            ->assertStatus(200);
        $this->assertSame($rfId, $issueRelated->json('data.rf.id'));
        $this->assertSame($reservationId, $issueRelated->json('data.reservations.0.id'));
        $this->assertSame($openingLotId, $issueRelated->json('data.lots.0.id'));
        $this->assertSame($issueAckId, $issueRelated->json('data.evidence_binding.id'));

        $issueMovements = $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issueId}/movements")
            ->assertStatus(200);
        $this->assertCount(1, $issueMovements->json('data'));
        $this->assertSame('-6.000000', $issueMovements->json('data.0.quantity'));
        $this->assertSame('6.000000', $issueMovements->json('data.0.balance_after'));
        $this->assertSame($this->variantId, $issueMovements->json('data.0.variant_id'));

        $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/stock/variants/{$this->variantId}")
            ->assertStatus(200)
            ->assertJsonPath('data.views.usable_stockroom_on_hand.quantity', '6')
            ->assertJsonPath('data.views.available_to_allocate.quantity', '2')
            ->assertJsonPath('data.views.rf_reserved.quantity', '4')
            ->assertJsonPath('data.views.quarantined_rejected.quantity', '3');

        $rfFinal = $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}")
            ->assertStatus(200);
        $this->assertSame('partially_issued', $rfFinal->json('data.fulfillment'));
        $this->assertSame('10', $rfFinal->json('data.lines.0.requested_quantity'));
        $this->assertSame('4', $rfFinal->json('data.lines.0.progress.reserved_quantity'));
        $this->assertSame('6', $rfFinal->json('data.lines.0.progress.issued_quantity'));
        $this->assertSame('4', $rfFinal->json('data.lines.0.progress.remaining_quantity'));
        $this->assertSame('0', $rfFinal->json('data.lines.0.progress.unreserved_quantity'));

        $outboxByEvent = DomainNotificationOutbox::where('chapter_id', $this->chapterId)
            ->orderByDesc('created_at')
            ->get()
            ->keyBy('event_name');
        foreach ([
            'stage1.ipc.changed.v1',
            'stage1.opening-rm.changed.v1',
            'stage1.opening-baseline.changed.v1',
            'stage1.internal-rf.changed.v1',
            'stage1.reservation-preparation.changed.v1',
            'stage1.rf-reservation.changed.v1',
            'stage1.actual-issue.changed.v1',
            'stage1.stock-lot.changed.v1',
        ] as $expectedEvent) {
            $this->assertTrue($outboxByEvent->has($expectedEvent), "Missing outbox event {$expectedEvent}");
        }

        // Verify cross-owner notification subject-read dispatch admission (including RF reservations and unsigned IPC readers)
        $subjectRead = app(NotificationSubjectRead::class);
        $custodianUser = User::findOrFail($this->custodianId);
        $requesterUser = User::findOrFail($this->requesterId);
        $approverUser = User::findOrFail($this->approverId);
        $financeUser = User::findOrFail($this->financeId);

        $unassignedReviewer = User::create([
            'id' => (string) Str::uuid(),
            'public_id' => 'unassigned-reviewer@example.invalid',
            'name' => 'Unassigned Reviewer',
            'email' => 'unassigned-reviewer@example.invalid',
            'password_hash' => hash('sha256', 'Password123!'),
            'status' => 'active',
            'version' => 1,
        ]);
        ChapterMembership::create([
            'id' => (string) Str::uuid(), 'chapter_id' => $this->chapterId,
            'user_id' => $unassignedReviewer->id, 'membership_status' => 'active', 'version' => 1,
        ]);
        DutyGrant::create([
            'id' => (string) Str::uuid(), 'chapter_id' => $this->chapterId, 'user_id' => $unassignedReviewer->id,
            'duty_code' => 'INDEPENDENT_REVIEWER', 'status' => 'active', 'is_alternate' => false,
            'valid_from' => now()->subDay(), 'version' => 1,
        ]);

        $unsignedHead = User::create([
            'id' => (string) Str::uuid(),
            'public_id' => 'unsigned-head@example.invalid',
            'name' => 'Unsigned Head',
            'email' => 'unsigned-head@example.invalid',
            'password_hash' => hash('sha256', 'Password123!'),
            'status' => 'active',
            'version' => 1,
        ]);
        ChapterMembership::create([
            'id' => (string) Str::uuid(), 'chapter_id' => $this->chapterId,
            'user_id' => $unsignedHead->id, 'membership_status' => 'active', 'version' => 1,
        ]);
        DutyGrant::create([
            'id' => (string) Str::uuid(), 'chapter_id' => $this->chapterId, 'user_id' => $unsignedHead->id,
            'duty_code' => 'CHAPTER_HEAD', 'status' => 'active', 'is_alternate' => false,
            'valid_from' => now()->subDay(), 'version' => 1,
        ]);

        DB::transaction(function () use ($subjectRead, $outboxByEvent, $custodianUser, $requesterUser, $approverUser, $financeUser, $unassignedReviewer, $unsignedHead) {
            $this->assertTrue($subjectRead->allows($unsignedHead, $outboxByEvent->get('stage1.ipc.changed.v1')));
            $this->assertFalse($subjectRead->allows($unassignedReviewer, $outboxByEvent->get('stage1.ipc.changed.v1')));
            $this->assertTrue($subjectRead->allows($custodianUser, $outboxByEvent->get('stage1.opening-rm.changed.v1')));
            $this->assertFalse($subjectRead->allows($requesterUser, $outboxByEvent->get('stage1.opening-rm.changed.v1')));
            $this->assertTrue($subjectRead->allows($custodianUser, $outboxByEvent->get('stage1.opening-baseline.changed.v1')));
            $this->assertFalse($subjectRead->allows($requesterUser, $outboxByEvent->get('stage1.opening-baseline.changed.v1')));
            $this->assertTrue($subjectRead->allows($requesterUser, $outboxByEvent->get('stage1.internal-rf.changed.v1')));
            $this->assertTrue($subjectRead->allows($approverUser, $outboxByEvent->get('stage1.internal-rf.changed.v1')));
            $this->assertTrue($subjectRead->allows($custodianUser, $outboxByEvent->get('stage1.internal-rf.changed.v1')));
            $this->assertFalse($subjectRead->allows($financeUser, $outboxByEvent->get('stage1.internal-rf.changed.v1')));
            $this->assertTrue($subjectRead->allows($custodianUser, $outboxByEvent->get('stage1.reservation-preparation.changed.v1')));
            $this->assertTrue($subjectRead->allows($custodianUser, $outboxByEvent->get('stage1.rf-reservation.changed.v1')));
            $this->assertFalse($subjectRead->allows($financeUser, $outboxByEvent->get('stage1.rf-reservation.changed.v1')));
            $this->assertTrue($subjectRead->allows($custodianUser, $outboxByEvent->get('stage1.actual-issue.changed.v1')));
            $this->assertFalse($subjectRead->allows($financeUser, $outboxByEvent->get('stage1.actual-issue.changed.v1')));
            $this->assertTrue($subjectRead->allows($custodianUser, $outboxByEvent->get('stage1.stock-lot.changed.v1')));
            $this->assertFalse($subjectRead->allows($financeUser, $outboxByEvent->get('stage1.stock-lot.changed.v1')));
        });

        // 8. Access and replay denial after loss of authority across both domains
        DutyGrant::where('chapter_id', $this->chapterId)
            ->where('user_id', $this->receiverId)
            ->where('duty_code', 'RECEIVING')
            ->update(['status' => 'revoked', 'version' => 2]);

        $this->asOfficer($this->receiverId, $postRmKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/post", $postRmPayload)
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'duty_denied');

        ChapterMembership::where('chapter_id', $this->chapterId)
            ->where('user_id', $this->custodianId)
            ->update(['membership_status' => 'revoked', 'version' => 2]);

        $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/stock/variants/{$this->variantId}")
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'chapter_not_found');

        $this->asOfficer($this->custodianId, $postIssueKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issueId}/post", $postIssuePayload)
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'chapter_not_found');

        DB::transaction(function () use ($subjectRead, $outboxByEvent, $custodianUser) {
            $this->assertFalse($subjectRead->allows($custodianUser->fresh(), $outboxByEvent->get('stage1.rf-reservation.changed.v1')));
            $this->assertFalse($subjectRead->allows($custodianUser->fresh(), $outboxByEvent->get('stage1.actual-issue.changed.v1')));
        });
    }

    private function seedConnectedChapterFixture(): void
    {
        $this->chapterId = (string) Str::uuid();
        $this->requestingUnitId = (string) Str::uuid();
        $this->custodianId = (string) Str::uuid();
        $this->receiverId = (string) Str::uuid();
        $this->headId = (string) Str::uuid();
        $this->financeId = (string) Str::uuid();
        $this->requesterId = (string) Str::uuid();
        $this->approverId = (string) Str::uuid();

        Chapter::create(['id' => $this->chapterId, 'code' => 'SYN-MRG', 'name' => 'Merge Chapter', 'status' => 'live', 'version' => 1]);

        foreach ([
            [$this->custodianId, 'custodian@example.invalid', 'Custodian', ['INVENTORY', 'DISPATCH'], null],
            [$this->receiverId, 'receiver@example.invalid', 'Receiver', ['INDEPENDENT_REVIEWER', 'RECEIVING'], null],
            [$this->headId, 'head@example.invalid', 'Chapter Head', ['CHAPTER_HEAD'], null],
            [$this->financeId, 'finance@example.invalid', 'Finance', ['FINANCE'], null],
            [$this->requesterId, 'requester@example.invalid', 'Committee Requester', ['COMMITTEE_REQUESTER'], ['unit_id' => $this->requestingUnitId]],
            [$this->approverId, 'approver@example.invalid', 'RF Approver', ['RF_APPROVER'], ['unit_id' => $this->requestingUnitId]],
        ] as [$uid, $email, $name, $duties, $scope]) {
            User::create([
                'id' => $uid,
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
                    'scope' => $scope,
                    'valid_from' => now()->subDay(),
                    'version' => 1,
                ]);
                if ($uid === $this->approverId && $duty === 'RF_APPROVER') {
                    $this->approverGrantId = $grant->id;
                }
            }
        }

        $this->unitId = (string) Str::uuid();
        CatalogueUnit::create([
            'id' => $this->unitId, 'chapter_id' => $this->chapterId, 'code' => 'PCS', 'name' => 'Pieces',
            'quantity_kind' => 'piece', 'quantity_scale' => 0, 'state' => 'active', 'material_version' => 1,
        ]);

        $this->itemId = (string) Str::uuid();
        CatalogueItem::create([
            'id' => $this->itemId, 'chapter_id' => $this->chapterId, 'code' => 'SHIRT', 'name' => 'Chapter Shirt',
            'unit_id' => $this->unitId, 'state' => 'active', 'material_version' => 1,
        ]);

        $this->variantId = (string) Str::uuid();
        CatalogueVariant::create([
            'id' => $this->variantId, 'chapter_id' => $this->chapterId, 'item_id' => $this->itemId, 'sku' => 'SHIRT-M',
            'code' => 'SHIRT-M', 'name' => 'Chapter Shirt M', 'label' => 'Chapter Shirt M',
            'unit_id' => $this->unitId, 'quantity_scale' => 0, 'state' => 'active', 'material_version' => 1,
        ]);

        $this->locationId = (string) Str::uuid();
        CatalogueLocation::create([
            'id' => $this->locationId, 'chapter_id' => $this->chapterId, 'code' => 'STOCKROOM-A', 'name' => 'Main Stockroom',
            'kind' => 'stockroom', 'custodian_id' => $this->custodianId, 'state' => 'active', 'material_version' => 1,
        ]);
    }

    /** @return array<int, array<string, mixed>> */
    private function seedEffectivePolicies(): array
    {
        $openingPolicies = [
            ['ipc_authorization', 'CHAPTER_HEAD', 'IpcAuthorizationPolicyValue', [
                'cutoff_at' => $this->cutoffAt,
                'count_team_ids' => [$this->custodianId, $this->receiverId],
                'suspension_record_reference' => 'SUSP-MRG-01',
            ], $this->headId],
            ['reference_series', 'CHAPTER_HEAD', 'OpeningReferencePolicyValue', [
                'ipc_prefix' => 'MRG-IPC',
                'rm_prefix' => 'MRG-RM',
                'minimum_digits' => 6,
            ], $this->headId],
            ['valuation_rounding', 'FINANCE', 'OpeningValuationPolicyValue', [
                'currency' => 'PHP',
                'unit_value_scale' => 2,
                'rounding_mode' => 'half_up',
                'round_at' => 'accepted_line',
                'valuation_basis_reference' => 'VAL-MRG-01',
            ], $this->financeId],
        ];
        $extraPolicies = [
            ['rf_approval_route', 'CHAPTER_HEAD', 'RfApprovalRoutePolicyValue', ['routes' => [[
                'requesting_unit_id' => $this->requestingUnitId,
                'primary_approver_grant_id' => $this->approverGrantId,
                'alternate_authorization_ids' => [],
            ]]], $this->headId],
            ['reference_series', 'CHAPTER_HEAD', 'RfReferenceSeriesPolicyValue', ['prefix' => 'MRG-RF', 'minimum_digits' => 6], $this->headId],
            ['reference_series', 'CHAPTER_HEAD', 'IssueReferenceSeriesPolicyValue', ['prefix' => 'MRG-ISAR', 'minimum_digits' => 6], $this->headId],
        ];

        $bindings = [];
        foreach (array_merge($openingPolicies, $extraPolicies) as $index => [$key, $owner, $schema, $value, $approverId]) {
            $id = (string) Str::uuid();
            PolicyRecord::create([
                'id' => $id,
                'aggregate_id' => $id,
                'chapter_id' => $this->chapterId,
                'policy_code' => $key,
                'policy_version' => 1,
                'rules_json' => $value,
                'effective_from' => now()->subDay(),
                'effective_until' => null,
            ]);
            AuditLog::create([
                'chapter_id' => $this->chapterId,
                'user_id' => $approverId,
                'action' => 'controlled:recordPolicy',
                'entity_type' => 'policy',
                'entity_id' => $id,
                'details' => [
                    'version' => 1,
                    'subject_id' => null,
                    'value_schema_reference' => '#/components/schemas/'.$schema,
                    'value_sha256' => CanonicalJson::sha256($value),
                    'approvals' => [['authority' => $owner, 'approver_id' => $approverId]],
                ],
            ]);
            if ($index < count($openingPolicies)) {
                $bindings[] = ['setting_key' => $key, 'policy_id' => $id, 'version' => 1];
            }
        }

        return $bindings;
    }

    /** @return array<string, mixed> */
    private function makeIpcLine(string $lineId, string $condition, string $qty): array
    {
        return [
            'line_id' => $lineId,
            'item_id' => $this->itemId,
            'variant_id' => $this->variantId,
            'variant_material_version' => 1,
            'unit_id' => $this->unitId,
            'unit_material_version' => 1,
            'quantity_scale' => 0,
            'historical_variant_label' => 'Chapter Shirt M',
            'location_id' => $this->locationId,
            'location_material_version' => 1,
            'regular_custodian_ids' => [$this->custodianId],
            'condition' => $condition,
            'counted_quantity' => $qty,
            'unit_value' => '25.00',
            'valuation_basis' => 'Documented cost basis',
            'provenance_reference' => 'Sheet M-1',
            'restrictions' => [
                'state' => 'unrestricted',
                'allowed_uses' => ['internal_use', 'sale', 'booth_custody'],
                'event_ids' => [],
                'requesting_unit_ids' => [],
                'effective_from' => null,
                'effective_until' => null,
                'interpretation_id' => null,
                'source_condition_reference' => null,
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function byteBinding(array $evidence): array
    {
        return [
            'evidence_id' => $evidence['evidence_id'],
            'version_id' => $evidence['version_id'],
            'attachments' => array_map(fn (array $a) => [
                'attachment_id' => $a['attachment_id'],
                'sha256' => $a['sha256'],
            ], $evidence['attachments']),
        ];
    }

    private function uploadPaper(string $userId, string $purpose, string $recordId, string $key): TestResponse
    {
        $boundary = 'ysp-ticket11-boundary';
        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ([
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>',
        ] as $i => $object) {
            $offsets[] = sprintf("%010d 00000 n \n", strlen($pdf));
            $pdf .= ($i + 1)." 0 obj\n{$object}\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= "xref\n0 4\n0000000000 65535 f \n".implode('', $offsets)."trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF\n";

        $raw = "--{$boundary}\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\n{$purpose}\r\n"
            ."--{$boundary}\r\nContent-Disposition: form-data; name=\"record_id\"\r\n\r\n{$recordId}\r\n"
            ."--{$boundary}\r\nContent-Disposition: form-data; name=\"attachments\"; filename=\"signed.pdf\"\r\n"
            ."Content-Type: application/pdf\r\n\r\n{$pdf}\r\n"
            ."--{$boundary}--\r\n";

        $this->asOfficer($userId, $key);

        return $this->call(
            'POST',
            "/api/v1/chapters/{$this->chapterId}/evidence",
            cookies: $this->prepareCookiesForRequest(),
            server: $this->transformHeadersToServerVars(['Accept' => 'application/json'])
                + ['CONTENT_TYPE' => "multipart/form-data; boundary={$boundary}"],
            content: $raw,
        );
    }

    private function asOfficer(string $userId, ?string $actionKey = null): self
    {
        $session = $this->sessionFor($userId);
        $headers = [
            'Accept' => 'application/json',
            'Origin' => $this->origin,
            'X-XSRF-TOKEN' => $session['csrf'],
        ];
        if ($actionKey !== null) {
            $headers['X-Action-Key'] = $actionKey;
        }

        return $this->flushHeaders()
            ->withCredentials()
            ->withUnencryptedCookie('ysp_session', $session['token'])
            ->withHeaders($headers);
    }

    /** @return array{token: string, csrf: string} */
    private function sessionFor(string $userId): array
    {
        config(['app.url' => $this->origin]);
        app('url')->useOrigin($this->origin);
        app('url')->forceScheme('https');

        $session = new BrowserSession([
            'user_id' => $userId,
            'user_version' => User::findOrFail($userId)->version,
            'authentication_method' => 'authenticator',
            'authenticated_at' => now(),
            'expires_at' => now()->addHour(),
        ]);
        $token = $session->rotateToken();
        $session->save();

        return ['token' => $token, 'csrf' => $session->csrf_token];
    }
}
