<?php

namespace Tests\Feature\Stage1A;

use App\Models\ActualIssue;
use App\Models\ActualIssueLine;
use App\Models\Buyer;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\EvidenceRecord;
use App\Models\Handover;
use App\Models\HandoverLine;
use App\Models\HandoverReceipt;
use App\Models\IdempotencyRecord;
use App\Models\InternalRf;
use App\Models\IssueReconciliation;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Models\User;
use App\Services\Delivery\HandoverCoordinatorService;
use App\Services\Delivery\SalesReleaseService;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use Exception;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\TestCase;

class HandoverInfrastructureTest extends TestCase
{
    use AuthenticatesBrowserOfficer;
    use RefreshDatabase;

    private string $chapterId = '60000000-0000-4000-8000-000000000101';

    private string $otherChapterId = '60000000-0000-4000-8000-000000000102';

    private string $userId = '10000000-0000-4000-8000-000000000101';

    protected function setUp(): void
    {
        parent::setUp();

        Chapter::create([
            'id' => $this->chapterId,
            'code' => 'CEB-HO',
            'name' => 'Cebu Chapter',
            'status' => 'live',
            'version' => 1,
        ]);

        Chapter::create([
            'id' => $this->otherChapterId,
            'code' => 'DVO-HO',
            'name' => 'Davao Chapter',
            'status' => 'live',
            'version' => 1,
        ]);

        User::create([
            'id' => $this->userId,
            'public_id' => 'officer@example.invalid',
            'name' => 'Handover Officer',
            'email' => 'officer@example.invalid',
            'password_hash' => hash('sha256', 'Password123!'),
            'status' => 'active',
            'version' => 1,
        ]);

        ChapterMembership::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $this->userId,
            'membership_status' => 'active',
            'version' => 1,
        ]);

        foreach (['INVENTORY_CUSTODIAN', 'INVENTORY'] as $duty) {
            DutyGrant::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $this->chapterId,
                'user_id' => $this->userId,
                'duty_code' => $duty,
                'status' => 'active',
                'valid_from' => now()->subDay(),
                'version' => 1,
            ]);
        }

        $this->withHeader('X-User-Id', $this->userId);
    }

    /**
     * Test 1: Table creation and model relationships.
     */
    public function test_table_creation_and_model_relationships(): void
    {
        // ActualIssue & lines & reconciliations
        $actualIssue = ActualIssue::create([
            'chapter_id' => $this->chapterId,
            'requisition_id' => (string) Str::uuid(),
            'issue_number' => 'IS-TEST-001',
            'status' => 'prepared',
            'recipient_name' => 'John Custodian',
            'prepared_by_user_id' => $this->userId,
            'actual_handover_at' => now(),
            'evidence_binding_id' => (string) Str::uuid(),
            'material_version' => 1,
        ]);

        $line = ActualIssueLine::create([
            'actual_issue_id' => $actualIssue->id,
            'requisition_line_id' => (string) Str::uuid(),
            'variant_id' => 'VAR-TEST-01',
            'unit_id' => 'UNIT-PCS',
            'lot_id' => 'LOT-001',
            'allocated_quantity' => 10.0000,
            'issued_quantity' => 10.0000,
        ]);

        $reconciliation = IssueReconciliation::create([
            'chapter_id' => $this->chapterId,
            'actual_issue_id' => $actualIssue->id,
            'officer_user_id' => $this->userId,
            'finding' => 'handed_over_unposted',
            'notes' => 'Paper physical voucher signed but pending DB sync',
            'reconciled_at' => now(),
        ]);

        $this->assertCount(1, $actualIssue->lines);
        $this->assertEquals($line->id, $actualIssue->lines->first()->id);
        $this->assertEquals($actualIssue->id, $line->actualIssue->id);

        $this->assertCount(1, $actualIssue->reconciliations);
        $this->assertEquals($reconciliation->id, $actualIssue->reconciliations->first()->id);
        $this->assertEquals($actualIssue->id, $reconciliation->actualIssue->id);

        // Handover & lines & receipts
        $handover = Handover::create([
            'chapter_id' => $this->chapterId,
            'handover_reference' => 'HO-REF-001',
            'source_type' => 'SALES_ORDER',
            'source_id' => (string) Str::uuid(),
            'recipient_name' => 'Jane Recipient',
            'actual_handover_at' => now(),
            'handover_officer_id' => $this->userId,
            'evidence_binding_id' => (string) Str::uuid(),
            'status' => 'COMMITTED',
        ]);

        $hoLine = HandoverLine::create([
            'handover_id' => $handover->id,
            'source_line_id' => (string) Str::uuid(),
            'variant_id' => 'VAR-TEST-02',
            'unit_id' => 'UNIT-BOX',
            'actual_quantity' => 5.0000,
            'inventory_movement_id' => (string) Str::uuid(),
        ]);

        $hoReceipt = HandoverReceipt::create([
            'handover_id' => $handover->id,
            'receipt_type' => 'CUSTOMER_DR',
            'receipt_number' => 'DR-TEST-001',
            'printed_at' => now(),
            'printed_by' => $this->userId,
        ]);

        $this->assertCount(1, $handover->lines);
        $this->assertEquals($hoLine->id, $handover->lines->first()->id);
        $this->assertEquals($handover->id, $hoLine->handover->id);

        $this->assertCount(1, $handover->receipts);
        $this->assertEquals($hoReceipt->id, $handover->receipts->first()->id);
        $this->assertEquals($handover->id, $hoReceipt->handover->id);
    }

    /**
     * Test 2: Idempotency Key Replay (exact replay returns 201 with cached response and 0 duplicate records).
     */
    public function test_idempotency_key_replay(): void
    {
        $idempotencyKey = 'TEST-KEY-001';
        $soId = (string) Str::uuid();
        $sourceLineId = (string) Str::uuid();

        $evidence = EvidenceRecord::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'technical_state' => 'ready',
            'created_by' => $this->userId,
        ]);

        $binding = app(CheckEvidenceBindingParticipant::class)->createOrUpdateBinding(
            $this->chapterId,
            $evidence->id,
            (string) Str::uuid(),
            'sales_order',
            $soId,
            'Alice Recipient',
            [
                [
                    'source_line_id' => $sourceLineId,
                    'actual_quantity' => '2.000',
                ],
            ]
        );

        $payload = [
            'source' => [
                'kind' => 'sales_order',
                'id' => $soId,
                'expected_version' => 1,
            ],
            'lines' => [
                [
                    'source_line_id' => $sourceLineId,
                    'actual_quantity' => '2.000',
                ],
            ],
            'recipient_name' => 'Alice Recipient',
            'actual_handover_at' => '2026-10-22T09:30:00+08:00',
            'acknowledgment_binding_id' => $binding->id,
        ];

        // First attempt: should succeed and create record
        $response1 = $this->withHeaders([
            'Idempotency-Key' => $idempotencyKey,
            'X-Chapter-Id' => $this->chapterId,
            'X-User-Id' => $this->userId,
        ])->postJson('/api/v1/handovers', $payload);

        $response1->assertStatus(201)
            ->assertJsonPath('outcome', 'committed')
            ->assertJsonPath('source.kind', 'sales_order')
            ->assertJsonPath('source.id', $soId);

        $this->assertEquals(1, Handover::count());
        $this->assertEquals(1, HandoverLine::count());
        $this->assertEquals(1, IdempotencyRecord::count());

        $firstHandoverId = $response1->json('handover_id');

        // Second attempt: identical key and payload -> must return exact cached response with zero duplicate records
        $response2 = $this->withHeaders([
            'Idempotency-Key' => $idempotencyKey,
            'X-Chapter-Id' => $this->chapterId,
            'X-User-Id' => $this->userId,
        ])->postJson('/api/v1/handovers', $payload);

        $response2->assertStatus(201)
            ->assertHeader('X-Action-Replayed', 'true')
            ->assertJsonPath('handover_id', $firstHandoverId);

        // Verify ZERO duplicate records in database
        $this->assertEquals(1, Handover::count(), 'Zero duplicate Handover records should be created on replay');
        $this->assertEquals(1, HandoverLine::count(), 'Zero duplicate HandoverLine records should be created on replay');
        $this->assertEquals(1, IdempotencyRecord::count(), 'Zero duplicate Idempotency records should be created');
    }

    /**
     * Test 3: Altered Payload Conflict (same key with altered quantity returns 409 Conflict).
     */
    public function test_altered_payload_conflict(): void
    {
        $idempotencyKey = 'TEST-KEY-CONFLICT-001';
        $soId = (string) Str::uuid();

        $originalPayload = [
            'source' => [
                'kind' => 'sales_order',
                'id' => $soId,
            ],
            'lines' => [
                [
                    'source_line_id' => (string) Str::uuid(),
                    'actual_quantity' => '2.000',
                ],
            ],
            'recipient_name' => 'Bob Recipient',
        ];

        // Initial request
        $resp1 = $this->withHeaders([
            'Idempotency-Key' => $idempotencyKey,
            'X-Chapter-Id' => $this->chapterId,
        ])->postJson('/api/v1/handovers', $originalPayload);

        $resp1->assertStatus(201);

        // Re-send with SAME key but altered line quantity (2.000 -> 3.000)
        $alteredPayload = $originalPayload;
        $alteredPayload['lines'][0]['actual_quantity'] = '3.000';

        $resp2 = $this->withHeaders([
            'Idempotency-Key' => $idempotencyKey,
            'X-Chapter-Id' => $this->chapterId,
        ])->postJson('/api/v1/handovers', $alteredPayload);

        $resp2->assertStatus(409)
            ->assertJsonPath('error', 'IDEMPOTENCY_CONFLICT')
            ->assertJsonPath('code', 'action_key_conflict');
    }

    /**
     * Test 4: Source dispatching for sales_order and requisition.
     */
    public function test_source_dispatching_for_sales_order_and_requisition(): void
    {
        // 4a: Sales Order dispatching
        $buyer = Buyer::create([
            'chapter_id' => $this->chapterId,
            'name' => 'Community Partner',
        ]);

        $so = SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-2026-DISPATCH-01',
            'buyer_id' => $buyer->id,
            'order_date' => '2026-11-02',
            'target_delivery_date' => '2026-11-10',
            'status' => 'APPROVED',
            'version' => 1,
            'created_by' => $this->userId,
        ]);

        $soLine = SalesOrderLine::create([
            'so_id' => $so->id,
            'variant_id' => 'VAR-SO-01',
            'unit_id' => 'UNIT-PCS',
            'ordered_quantity' => 10.00,
            'unit_price' => 50.00,
            'line_total' => 500.00,
            'delivered_quantity' => 0.00,
            'line_status' => 'ACTIVE',
        ]);

        $soPayload = [
            'source' => [
                'kind' => 'sales_order',
                'id' => $so->id,
                'expected_version' => 1,
            ],
            'lines' => [
                [
                    'source_line_id' => $soLine->id,
                    'actual_quantity' => '4.000',
                ],
            ],
            'recipient_name' => 'Sales Order Recipient',
        ];

        $soResponse = $this->withHeaders([
            'Idempotency-Key' => 'DISPATCH-SO-KEY',
            'X-Chapter-Id' => $this->chapterId,
        ])->postJson('/api/v1/handovers', $soPayload);

        $soResponse->assertStatus(201)
            ->assertJsonPath('outcome', 'committed')
            ->assertJsonPath('source.kind', 'sales_order')
            ->assertJsonPath('lines.0.committed_quantity', '4.000')
            ->assertJsonPath('lines.0.remaining_quantity', '6.000');

        $this->assertDatabaseHas('handovers', [
            'source_type' => 'SALES_ORDER',
            'source_id' => $so->id,
            'status' => 'COMMITTED',
        ]);

        $this->assertDatabaseHas('handover_receipts', [
            'receipt_type' => 'CUSTOMER_DR',
        ]);

        // 4b: Requisition dispatching
        $reqId = (string) Str::uuid();
        $reqLineId = (string) Str::uuid();

        $reqPayload = [
            'source' => [
                'kind' => 'requisition',
                'id' => $reqId,
            ],
            'lines' => [
                [
                    'source_line_id' => $reqLineId,
                    'actual_quantity' => '7.000',
                    'variant_id' => 'VAR-REQ-01',
                    'unit_id' => 'UNIT-KG',
                ],
            ],
            'recipient_name' => 'Internal Requester Team',
        ];

        $reqResponse = $this->withHeaders([
            'Idempotency-Key' => 'DISPATCH-REQ-KEY',
            'X-Chapter-Id' => $this->chapterId,
        ])->postJson('/api/v1/handovers', $reqPayload);

        $reqResponse->assertStatus(201)
            ->assertJsonPath('outcome', 'committed')
            ->assertJsonPath('source.kind', 'requisition');

        // Check that ActualIssue and Handover are created
        $this->assertDatabaseHas('actual_issues', [
            'requisition_id' => $reqId,
            'status' => 'posted',
            'recipient_name' => 'Internal Requester Team',
        ]);

        $this->assertDatabaseHas('actual_issue_lines', [
            'requisition_line_id' => $reqLineId,
            'issued_quantity' => 7.0000,
        ]);

        $this->assertDatabaseHas('handovers', [
            'source_type' => 'REQUISITION',
            'source_id' => $reqId,
            'status' => 'COMMITTED',
        ]);

        $this->assertDatabaseHas('handover_receipts', [
            'receipt_type' => 'IS_AR',
        ]);
    }

    /**
     * Test 5: GET /api/v1/operations/by-idempotency-key/{key} lookup.
     */
    public function test_get_operation_by_idempotency_key_lookup(): void
    {
        $idempotencyKey = 'LOOKUP-KEY-999';

        $payload = [
            'source' => [
                'kind' => 'sales_order',
                'id' => (string) Str::uuid(),
            ],
            'lines' => [
                [
                    'source_line_id' => (string) Str::uuid(),
                    'actual_quantity' => '1.500',
                ],
            ],
            'recipient_name' => 'Lookup Recipient',
        ];

        $createResp = $this->withHeaders([
            'Idempotency-Key' => $idempotencyKey,
            'X-Chapter-Id' => $this->chapterId,
        ])->postJson('/api/v1/handovers', $payload);

        $createResp->assertStatus(201);
        $expectedHandoverId = $createResp->json('handover_id');

        // Retrieve using operation lookup endpoint
        $lookupResp = $this->withHeaders([
            'X-Chapter-Id' => $this->chapterId,
        ])->getJson("/api/v1/operations/by-idempotency-key/{$idempotencyKey}");

        $lookupResp->assertStatus(201)
            ->assertHeader('X-Action-Replayed', 'true')
            ->assertJsonPath('handover_id', $expectedHandoverId)
            ->assertJsonPath('outcome', 'committed');

        // Unknown key returns 404
        $notFoundResp = $this->getJson('/api/v1/operations/by-idempotency-key/NON-EXISTENT-KEY');
        $notFoundResp->assertStatus(404)
            ->assertJsonPath('error', 'OPERATION_NOT_FOUND');
    }

    /**
     * Test 6: Transaction rollback safety (exception in source service rolls back everything).
     */
    public function test_transaction_rollback_safety(): void
    {
        $mockSalesService = $this->createStub(SalesReleaseService::class);
        $mockSalesService->method('postCustomerRelease')
            ->willThrowException(new Exception('Simulated inventory stock movement failure during release'));

        $coordinator = new HandoverCoordinatorService(salesReleaseService: $mockSalesService);
        $this->app->instance(HandoverCoordinatorService::class, $coordinator);

        $initialHandovers = Handover::count();
        $initialLines = HandoverLine::count();
        $initialIdempotency = IdempotencyRecord::count();

        $payload = [
            'source' => [
                'kind' => 'sales_order',
                'id' => (string) Str::uuid(),
            ],
            'lines' => [
                [
                    'source_line_id' => (string) Str::uuid(),
                    'actual_quantity' => '5.000',
                ],
            ],
            'recipient_name' => 'Rollback Recipient',
        ];

        try {
            $this->withHeaders([
                'Idempotency-Key' => 'ROLLBACK-KEY-001',
                'X-Chapter-Id' => $this->chapterId,
            ])->postJson('/api/v1/handovers', $payload);
        } catch (Exception) {
            // Expected
        }

        // Assert database state is completely pristine - zero writes persisted
        $this->assertEquals($initialHandovers, Handover::count(), 'Handover records must roll back on failure');
        $this->assertEquals($initialLines, HandoverLine::count(), 'HandoverLine records must roll back on failure');
        $this->assertEquals($initialIdempotency, IdempotencyRecord::count(), 'Idempotency records must not be retained on failure');
    }

    /**
     * Test 7: Multi-tenancy chapter isolation.
     */
    public function test_multitenancy_chapter_isolation(): void
    {
        $keyChapterA = 'KEY-CHAP-A-001';

        // Create handover under chapter A
        $payloadA = [
            'source' => ['kind' => 'sales_order', 'id' => (string) Str::uuid()],
            'lines' => [['source_line_id' => (string) Str::uuid(), 'actual_quantity' => '1.000']],
            'recipient_name' => 'Chapter A Recipient',
        ];

        $respA = $this->withHeaders([
            'Idempotency-Key' => $keyChapterA,
            'X-Chapter-Id' => $this->chapterId,
        ])->postJson('/api/v1/handovers', $payloadA);

        $respA->assertStatus(201);

        // Attempt lookup with Chapter B context: must return 404 (isolation enforced)
        $respCrossChapter = $this->withHeaders([
            'X-Chapter-Id' => $this->otherChapterId,
        ])->getJson("/api/v1/operations/by-idempotency-key/{$keyChapterA}");

        $respCrossChapter->assertStatus(404)
            ->assertJsonPath('error', 'OPERATION_NOT_FOUND');

        // List handovers under chapter B should not see chapter A's handover
        $listChapterB = $this->withHeaders([
            'X-Chapter-Id' => $this->otherChapterId,
        ])->getJson('/api/v1/handovers');

        $listChapterB->assertStatus(200)
            ->assertJsonCount(0, 'data');
    }

    /**
     * Test 8: Issue reconciliation creation.
     */
    public function test_issue_reconciliation_creation(): void
    {
        $headId = (string) Str::uuid();
        $financeId = (string) Str::uuid();
        foreach ([[$headId, 'head-ho@example.invalid', 'CHAPTER_HEAD'], [$financeId, 'fin-ho@example.invalid', 'FINANCE']] as [$uid, $email, $duty]) {
            User::create([
                'id' => $uid,
                'public_id' => $email,
                'name' => $duty,
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
            DutyGrant::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $this->chapterId,
                'user_id' => $uid,
                'duty_code' => $duty,
                'status' => 'active',
                'valid_from' => now()->subDay(),
                'version' => 1,
            ]);
        }

        $this->seedEffectiveStage1Policies($this->chapterId, $headId, $financeId);

        $rfId = (string) Str::uuid();
        InternalRf::create([
            'id' => $rfId,
            'chapter_id' => $this->chapterId,
            'rf_number' => 'SYN-RF-000001',
            'status' => 'approved',
            'purpose' => 'internal_use',
            'requester_user_id' => $headId,
            'version' => 1,
            'material_version' => 1,
            'progress_version' => 1,
        ]);

        // 1. Prepare actual issue
        $preparePayload = [
            'recipient_name' => 'Recon Custodian',
            'lines' => [
                [
                    'variant_id' => 'VAR-RECON-01',
                    'unit_id' => 'UNIT-PCS',
                    'actual_quantity' => '12.0000',
                ],
            ],
        ];

        $prepareResp = $this->asBrowserOfficer($this->userId, (string) Str::uuid())
            ->postJson(
                "/api/v1/chapters/{$this->chapterId}/internal-rfs/{$rfId}/actual-issues",
                $preparePayload
            );

        $prepareResp->assertStatus(201)
            ->assertJsonPath('data.status', 'prepared')
            ->assertJsonPath('data.recipient_name', 'Recon Custodian');

        $issueId = $prepareResp->json('data.id');

        // 2. Post reconciliation record (handed_over_unposted requires matched acknowledgment or evidence reference)
        $reconPayload = [
            'finding' => 'handed_over_unposted',
            'notes' => 'Recipient verified delivery in physical log but server offline during event',
            'officer_user_id' => $this->userId,
            'evidence' => ['evidence_id' => (string) Str::uuid()],
        ];

        $reconResp = $this->asBrowserOfficer($this->userId, (string) Str::uuid())
            ->postJson(
                "/api/v1/chapters/{$this->chapterId}/actual-issues/{$issueId}/reconciliations",
                $reconPayload
            );

        $reconResp->assertStatus(201)
            ->assertJsonPath('data.actual_issue_id', $issueId)
            ->assertJsonPath('data.finding', 'handed_over_unposted')
            ->assertJsonPath('data.officer_user_id', $this->userId);

        $this->assertDatabaseHas('issue_reconciliations', [
            'actual_issue_id' => $issueId,
            'finding' => 'handed_over_unposted',
            'chapter_id' => $this->chapterId,
        ]);

        // 3. Read back reconciliation
        $readReconResp = $this->asBrowserOfficer($this->userId)
            ->get("/api/v1/chapters/{$this->chapterId}/actual-issues/{$issueId}/reconciliation");

        $readReconResp->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.finding', 'handed_over_unposted');
    }
}
