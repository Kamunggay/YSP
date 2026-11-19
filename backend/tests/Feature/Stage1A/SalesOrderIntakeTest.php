<?php

namespace Tests\Feature\Stage1A;

use App\Models\Buyer;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Models\SalesOrderRevision;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class SalesOrderIntakeTest extends TestCase
{
    use RefreshDatabase;

    private string $chapterId = 'chap-cebu-01';

    private string $userId = 'user-sales-01';

    protected function setUp(): void
    {
        parent::setUp();

        Chapter::create([
            'id' => $this->chapterId,
            'code' => 'CEB-01',
            'name' => 'Cebu Chapter',
            'status' => 'live',
            'version' => 1,
        ]);

        User::create([
            'id' => $this->userId,
            'public_id' => 'sales@example.invalid',
            'name' => 'Sales Officer',
            'email' => 'sales@example.invalid',
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

        DutyGrant::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $this->userId,
            'duty_code' => 'SALES_OFFICER',
            'status' => 'active',
            'valid_from' => now()->subDay(),
            'version' => 1,
        ]);

        $this->withHeader('X-User-Id', $this->userId);
    }

    public function test_can_create_and_list_buyers(): void
    {
        $payload = [
            'name' => 'John Doe',
            'organization_name' => 'Cebu Youth Org',
            'contact_person' => 'Jane Doe',
            'phone' => '+639123456789',
            'email' => 'john.doe@example.com',
            'address' => '123 Mango Ave, Cebu City',
        ];

        $createResponse = $this->postJson("/api/v1/chapters/{$this->chapterId}/buyers", $payload);

        $createResponse->assertStatus(201)
            ->assertJsonPath('data.name', 'John Doe')
            ->assertJsonPath('data.organization_name', 'Cebu Youth Org')
            ->assertJsonPath('data.chapter_id', $this->chapterId);

        $buyerId = $createResponse->json('data.id');
        $this->assertDatabaseHas('buyers', [
            'id' => $buyerId,
            'name' => 'John Doe',
            'chapter_id' => $this->chapterId,
        ]);

        $listResponse = $this->getJson("/api/v1/chapters/{$this->chapterId}/buyers?q=Cebu");
        $listResponse->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $buyerId);
    }

    public function test_can_create_draft_sales_order_with_lines(): void
    {
        $buyer = Buyer::create([
            'chapter_id' => $this->chapterId,
            'name' => 'St. Peter Parish',
            'organization_name' => 'Parish Council',
        ]);

        $payload = [
            'buyer_id' => $buyer->id,
            'order_date' => '2026-11-02',
            'target_delivery_date' => '2026-11-10',
            'terms_conditions' => 'Standard 48-hour reservation payment terms.',
            'created_by' => 'staff-officer-01',
            'lines' => [
                [
                    'variant_id' => 'VAR-SHIRT-M-BLU',
                    'unit_id' => 'PCS',
                    'ordered_quantity' => 10,
                    'unit_price' => 250.00,
                ],
                [
                    'variant_id' => 'VAR-CAP-BLK',
                    'unit_id' => 'PCS',
                    'ordered_quantity' => 5,
                    'unit_price' => 120.00,
                ],
            ],
        ];

        $response = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders", $payload);

        $response->assertStatus(201)
            ->assertJsonPath('data.status', 'DRAFT')
            ->assertJsonPath('data.version', 1)
            ->assertJsonPath('data.created_by', 'staff-officer-01')
            ->assertJsonCount(2, 'data.lines');

        $soId = $response->json('data.id');
        $this->assertDatabaseHas('sales_orders', [
            'id' => $soId,
            'status' => 'DRAFT',
            'chapter_id' => $this->chapterId,
        ]);

        $this->assertDatabaseHas('sales_order_lines', [
            'so_id' => $soId,
            'variant_id' => 'VAR-SHIRT-M-BLU',
            'line_total' => 2500.00,
        ]);

        $this->assertDatabaseHas('sales_order_lines', [
            'so_id' => $soId,
            'variant_id' => 'VAR-CAP-BLK',
            'line_total' => 600.00,
        ]);
    }

    public function test_cross_chapter_buyer_cannot_be_used_for_sales_order(): void
    {
        // Buyer belongs to a different chapter
        $foreignBuyer = Buyer::create([
            'chapter_id' => 'chap-manila-01',
            'name' => 'Manila Youth Assembly',
        ]);

        $payload = [
            'buyer_id' => $foreignBuyer->id,
            'target_delivery_date' => '2026-11-10',
            'created_by' => 'staff-officer-01',
            'lines' => [
                [
                    'variant_id' => 'VAR-SHIRT-M',
                    'unit_id' => 'PCS',
                    'ordered_quantity' => 5,
                    'unit_price' => 250.00,
                ],
            ],
        ];

        // Attempting to create an SO in Cebu with a Manila buyer must fail with 422
        $response = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders", $payload);
        $response->assertStatus(422)
            ->assertJsonValidationErrors(['buyer_id']);
    }

    public function test_duplicate_so_number_returns_422_validation_error(): void
    {
        $buyer = Buyer::create([
            'chapter_id' => $this->chapterId,
            'name' => 'St. Francis Chapter',
        ]);

        $payload = [
            'buyer_id' => $buyer->id,
            'so_number' => 'SO-UNIQUE-1001',
            'target_delivery_date' => '2026-11-10',
            'created_by' => 'staff-officer-01',
            'lines' => [
                [
                    'variant_id' => 'VAR-SHIRT-M',
                    'unit_id' => 'PCS',
                    'ordered_quantity' => 2,
                    'unit_price' => 250.00,
                ],
            ],
        ];

        // First creation succeeds
        $res1 = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders", $payload);
        $res1->assertStatus(201);

        // Second creation with identical so_number must fail with 422
        $res2 = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders", $payload);
        $res2->assertStatus(422)
            ->assertJsonValidationErrors(['so_number']);
    }

    public function test_can_submit_sales_order(): void
    {
        $buyer = Buyer::create([
            'chapter_id' => $this->chapterId,
            'name' => 'Alliance Group',
        ]);

        $so = SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-TEST-0001',
            'buyer_id' => $buyer->id,
            'order_date' => '2026-11-02',
            'target_delivery_date' => '2026-11-15',
            'status' => 'DRAFT',
            'created_by' => 'staff-officer-01',
        ]);

        $response = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/submit");

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'SUBMITTED');

        $this->assertDatabaseHas('sales_orders', [
            'id' => $so->id,
            'status' => 'SUBMITTED',
        ]);
    }

    public function test_self_approval_is_prevented_with_403_forbidden(): void
    {
        $buyer = Buyer::create([
            'chapter_id' => $this->chapterId,
            'name' => 'Youth Ministry',
        ]);

        $so = SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-SELF-APPROVE-01',
            'buyer_id' => $buyer->id,
            'order_date' => '2026-11-02',
            'target_delivery_date' => '2026-11-15',
            'status' => 'SUBMITTED',
            'created_by' => 'officer-maria',
        ]);

        // Attempting to self-approve with reviewer_id == created_by
        $response = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/review", [
            'action' => 'APPROVE',
            'reviewer_id' => 'officer-maria',
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('message', 'Self-approval is forbidden under GOV-05 and SO-02.');

        $this->assertDatabaseHas('sales_orders', [
            'id' => $so->id,
            'status' => 'SUBMITTED',
            'approved_by' => null,
        ]);
    }

    public function test_authorized_reviewer_can_approve_sales_order(): void
    {
        $buyer = Buyer::create([
            'chapter_id' => $this->chapterId,
            'name' => 'San Jose Community',
        ]);

        $so = SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-APPROVE-01',
            'buyer_id' => $buyer->id,
            'order_date' => '2026-11-02',
            'target_delivery_date' => '2026-11-15',
            'status' => 'SUBMITTED',
            'created_by' => 'officer-maria',
        ]);

        // Independent reviewer approves
        $response = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/review", [
            'action' => 'APPROVE',
            'reviewer_id' => 'reviewer-pedro',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'APPROVED')
            ->assertJsonPath('data.approved_by', 'reviewer-pedro');

        $this->assertDatabaseHas('sales_orders', [
            'id' => $so->id,
            'status' => 'APPROVED',
            'approved_by' => 'reviewer-pedro',
        ]);
    }

    public function test_reviewer_can_return_sales_order_for_revision_with_reason(): void
    {
        $buyer = Buyer::create([
            'chapter_id' => $this->chapterId,
            'name' => 'Community Church',
        ]);

        $so = SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-RETURN-01',
            'buyer_id' => $buyer->id,
            'order_date' => '2026-11-02',
            'target_delivery_date' => '2026-11-15',
            'status' => 'SUBMITTED',
            'created_by' => 'officer-maria',
        ]);

        $response = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/review", [
            'action' => 'RETURN',
            'reviewer_id' => 'reviewer-pedro',
            'rejection_reason' => 'Target delivery date conflicts with inventory arrival schedule.',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'RETURNED')
            ->assertJsonPath('data.rejection_reason', 'Target delivery date conflicts with inventory arrival schedule.');

        $this->assertDatabaseHas('sales_orders', [
            'id' => $so->id,
            'status' => 'RETURNED',
            'rejection_reason' => 'Target delivery date conflicts with inventory arrival schedule.',
        ]);
    }

    public function test_sales_order_revision_increments_version_and_records_audit_history(): void
    {
        $buyer = Buyer::create([
            'chapter_id' => $this->chapterId,
            'name' => 'Grace Foundation',
        ]);

        $so = SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-REV-01',
            'buyer_id' => $buyer->id,
            'order_date' => '2026-11-02',
            'target_delivery_date' => '2026-11-15',
            'status' => 'RETURNED',
            'version' => 1,
            'created_by' => 'officer-maria',
            'rejection_reason' => 'Unit price incorrect.',
        ]);

        SalesOrderLine::create([
            'so_id' => $so->id,
            'variant_id' => 'VAR-SHIRT-M',
            'unit_id' => 'PCS',
            'ordered_quantity' => 10,
            'unit_price' => 200.00,
            'line_total' => 2000.00,
        ]);

        $revisePayload = [
            'reason' => 'Corrected unit price from 200 to 220 per pricing guideline.',
            'created_by' => 'officer-maria',
            'target_delivery_date' => '2026-11-20',
            'lines' => [
                [
                    'variant_id' => 'VAR-SHIRT-M',
                    'unit_id' => 'PCS',
                    'ordered_quantity' => 10,
                    'unit_price' => 220.00,
                ],
            ],
        ];

        $response = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/revise", $revisePayload);

        $response->assertStatus(200)
            ->assertJsonPath('data.version', 2)
            ->assertJsonPath('data.status', 'SUBMITTED')
            ->assertJsonPath('data.target_delivery_date', '2026-11-20T00:00:00.000000Z')
            ->assertJsonPath('data.rejection_reason', null);

        $this->assertDatabaseHas('sales_orders', [
            'id' => $so->id,
            'version' => 2,
            'status' => 'SUBMITTED',
            'rejection_reason' => null,
        ]);

        $this->assertDatabaseHas('sales_order_lines', [
            'so_id' => $so->id,
            'unit_price' => 220.00,
            'line_total' => 2200.00,
        ]);

        // Verify immutable audit history was saved
        $this->assertDatabaseHas('sales_order_revisions', [
            'so_id' => $so->id,
            'version' => 1,
            'reason' => 'Corrected unit price from 200 to 220 per pricing guideline.',
            'created_by' => 'officer-maria',
        ]);

        $revision = SalesOrderRevision::where('so_id', $so->id)->first();
        $this->assertNotNull($revision);
        $this->assertSame(1, $revision->version);
        $this->assertIsArray($revision->snapshot);
        $this->assertSame('SO-REV-01', $revision->snapshot['so_number']);
    }

    public function test_sales_order_can_be_cancelled_and_cascades_line_status(): void
    {
        $buyer = Buyer::create([
            'chapter_id' => $this->chapterId,
            'name' => 'Metro High School',
        ]);

        $so = SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-CANCEL-01',
            'buyer_id' => $buyer->id,
            'order_date' => '2026-11-02',
            'target_delivery_date' => '2026-11-15',
            'status' => 'SUBMITTED',
            'created_by' => 'officer-maria',
        ]);

        $line = SalesOrderLine::create([
            'so_id' => $so->id,
            'variant_id' => 'VAR-SHIRT-M',
            'unit_id' => 'PCS',
            'ordered_quantity' => 10,
            'unit_price' => 250.00,
            'line_total' => 2500.00,
            'line_status' => 'ACTIVE',
        ]);

        $response = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/cancel", [
            'reason' => 'Buyer requested cancellation due to event rescheduling.',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'CANCELLED');

        $this->assertDatabaseHas('sales_orders', [
            'id' => $so->id,
            'status' => 'CANCELLED',
            'rejection_reason' => 'Buyer requested cancellation due to event rescheduling.',
        ]);

        // Lines must be updated to CANCELLED to prevent false active demand
        $this->assertDatabaseHas('sales_order_lines', [
            'id' => $line->id,
            'line_status' => 'CANCELLED',
        ]);
    }

    public function test_invalid_state_transitions_are_rejected_with_422(): void
    {
        $buyer = Buyer::create([
            'chapter_id' => $this->chapterId,
            'name' => 'Boundary Testing Group',
        ]);

        $draftSo = SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-STATE-DRAFT',
            'buyer_id' => $buyer->id,
            'order_date' => '2026-11-02',
            'target_delivery_date' => '2026-11-15',
            'status' => 'DRAFT',
            'created_by' => 'officer-01',
        ]);

        $approvedSo = SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-STATE-APPROVED',
            'buyer_id' => $buyer->id,
            'order_date' => '2026-11-02',
            'target_delivery_date' => '2026-11-15',
            'status' => 'APPROVED',
            'created_by' => 'officer-01',
            'approved_by' => 'reviewer-pedro',
        ]);

        $cancelledSo = SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-STATE-CANCELLED',
            'buyer_id' => $buyer->id,
            'order_date' => '2026-11-02',
            'target_delivery_date' => '2026-11-15',
            'status' => 'CANCELLED',
            'created_by' => 'officer-01',
        ]);

        // 1. Cannot review a DRAFT order (must be SUBMITTED first)
        $resReviewDraft = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$draftSo->id}/review", [
            'action' => 'APPROVE',
            'reviewer_id' => 'reviewer-pedro',
        ]);
        $resReviewDraft->assertStatus(422);

        // 2. Cannot submit an already APPROVED order
        $resSubmitApproved = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$approvedSo->id}/submit");
        $resSubmitApproved->assertStatus(422);

        // 3. Cannot revise an APPROVED order
        $resReviseApproved = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$approvedSo->id}/revise", [
            'reason' => 'Invalid attempt to alter approved commitment',
        ]);
        $resReviseApproved->assertStatus(422);

        // 4. Cannot cancel an already CANCELLED order
        $resCancelAgain = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$cancelledSo->id}/cancel");
        $resCancelAgain->assertStatus(422);

        // 5. Cannot review a CANCELLED order
        $resReviewCancelled = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$cancelledSo->id}/review", [
            'action' => 'APPROVE',
            'reviewer_id' => 'reviewer-pedro',
        ]);
        $resReviewCancelled->assertStatus(422);
    }

    public function test_sales_orders_list_filtering_by_status_and_buyer(): void
    {
        $buyer1 = Buyer::create([
            'chapter_id' => $this->chapterId,
            'name' => 'Buyer Alpha',
        ]);

        $buyer2 = Buyer::create([
            'chapter_id' => $this->chapterId,
            'name' => 'Buyer Beta',
        ]);

        SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-FILTER-01',
            'buyer_id' => $buyer1->id,
            'order_date' => '2026-11-01',
            'target_delivery_date' => '2026-11-10',
            'status' => 'DRAFT',
            'created_by' => 'officer-01',
        ]);

        SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-FILTER-02',
            'buyer_id' => $buyer1->id,
            'order_date' => '2026-11-02',
            'target_delivery_date' => '2026-11-12',
            'status' => 'APPROVED',
            'created_by' => 'officer-01',
        ]);

        SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-FILTER-03',
            'buyer_id' => $buyer2->id,
            'order_date' => '2026-11-03',
            'target_delivery_date' => '2026-11-15',
            'status' => 'DRAFT',
            'created_by' => 'officer-02',
        ]);

        // Filter by status=DRAFT
        $drafts = $this->getJson("/api/v1/chapters/{$this->chapterId}/sales-orders?status=DRAFT");
        $drafts->assertStatus(200)->assertJsonCount(2, 'data');

        // Filter by buyer_id=buyer1->id
        $buyer1Orders = $this->getJson("/api/v1/chapters/{$this->chapterId}/sales-orders?buyer_id={$buyer1->id}");
        $buyer1Orders->assertStatus(200)->assertJsonCount(2, 'data');

        // Filter by status=APPROVED and buyer_id=buyer1->id
        $approvedBuyer1 = $this->getJson("/api/v1/chapters/{$this->chapterId}/sales-orders?status=APPROVED&buyer_id={$buyer1->id}");
        $approvedBuyer1->assertStatus(200)->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.so_number', 'SO-FILTER-02');
    }

    public function test_allow_self_approval_bypass_rejected_and_active_alternate_grant_allowed(): void
    {
        $buyer = Buyer::create([
            'chapter_id' => $this->chapterId,
            'name' => 'Alternate Authority Parish',
        ]);

        $so = SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-ALT-01',
            'buyer_id' => $buyer->id,
            'order_date' => '2026-11-02',
            'target_delivery_date' => '2026-11-15',
            'status' => 'SUBMITTED',
            'created_by' => $this->userId,
        ]);

        // Passing allow_self_approval=true without an active alternate DutyGrant still fails 403
        $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/review", [
            'action' => 'APPROVE',
            'reviewer_id' => $this->userId,
            'allow_self_approval' => true,
        ])->assertStatus(403);

        // Grant active alternate authority DutyGrant -> self-approval succeeds
        DutyGrant::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $this->userId,
            'duty_code' => 'SALES_REVIEWER',
            'status' => 'active',
            'is_alternate' => true,
            'valid_from' => now()->subDay(),
            'version' => 1,
        ]);

        $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/review", [
            'action' => 'APPROVE',
            'reviewer_id' => $this->userId,
        ])->assertStatus(200)
            ->assertJsonPath('data.status', 'APPROVED');
    }
}
