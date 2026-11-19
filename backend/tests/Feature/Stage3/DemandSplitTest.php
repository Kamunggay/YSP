<?php

namespace Tests\Feature\Stage3;

use App\Models\Buyer;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DutyGrant;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Models\SalesOrderRevision;
use App\Models\StockReservation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Tests\TestCase;

class DemandSplitTest extends TestCase
{
    use RefreshDatabase;

    private string $chapterId = 'chap-cebu-01';

    private string $userId = 'user-sales-split-01';

    protected function setUp(): void
    {
        parent::setUp();

        Chapter::create([
            'id' => $this->chapterId,
            'code' => 'CEB-SPLIT',
            'name' => 'Cebu Chapter',
            'status' => 'live',
            'version' => 1,
        ]);

        Chapter::create([
            'id' => 'chap-manila-02',
            'code' => 'MNL-02',
            'name' => 'Manila Chapter',
            'status' => 'live',
            'version' => 1,
        ]);

        User::create([
            'id' => $this->userId,
            'public_id' => 'sales.split@example.invalid',
            'name' => 'Sales Officer',
            'email' => 'sales.split@example.invalid',
            'password_hash' => hash('sha256', 'Password123!'),
            'status' => 'active',
            'version' => 1,
        ]);

        foreach ([$this->chapterId, 'chap-manila-02'] as $cid) {
            ChapterMembership::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $cid,
                'user_id' => $this->userId,
                'membership_status' => 'active',
                'version' => 1,
            ]);

            DutyGrant::create([
                'id' => (string) Str::uuid(),
                'chapter_id' => $cid,
                'user_id' => $this->userId,
                'duty_code' => 'SALES_OFFICER',
                'status' => 'active',
                'valid_from' => Carbon::parse('2020-01-01 00:00:00'),
                'version' => 1,
            ]);
        }

        $this->withHeader('X-User-Id', $this->userId);
    }

    private function createSalesOrderWithLines(array $lines): SalesOrder
    {
        $buyer = Buyer::create([
            'chapter_id' => $this->chapterId,
            'name' => 'St. Ignatius Parish',
            'organization_name' => 'Parish Pastoral Council',
        ]);

        $so = SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-CEBU-TEST-'.uniqid(),
            'buyer_id' => $buyer->id,
            'order_date' => '2026-11-03',
            'target_delivery_date' => '2026-11-15',
            'status' => 'SUBMITTED',
            'created_by' => 'officer-01',
        ]);

        foreach ($lines as $line) {
            SalesOrderLine::create([
                'so_id' => $so->id,
                'variant_id' => $line['variant_id'],
                'unit_id' => $line['unit_id'] ?? 'PCS',
                'ordered_quantity' => $line['ordered_quantity'],
                'unit_price' => $line['unit_price'] ?? 250.00,
                'line_total' => round($line['ordered_quantity'] * ($line['unit_price'] ?? 250.00), 2),
                'reserved_quantity' => 0,
                'backordered_quantity' => 0,
                'delivered_quantity' => 0,
                'line_status' => 'ACTIVE',
                'material_version' => 1,
            ]);
        }

        return $so->fresh(['buyer', 'lines']);
    }

    /**
     * Test 1: Stock Splitting Test (order 10 shirts when available stock is 6 -> assert 6 reserved in stock_reservations, 4 backordered shortage, and 48h unpaid expiry timer set).
     */
    public function test_stock_splitting_partial_availability(): void
    {
        $so = $this->createSalesOrderWithLines([
            [
                'variant_id' => 'VAR-SHIRT-M-BLU',
                'ordered_quantity' => 10,
            ],
        ]);

        $payload = [
            'available_stock' => [
                'VAR-SHIRT-M-BLU' => 6,
            ],
        ];

        $response = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/split-demand", $payload);

        $response->assertStatus(200)
            ->assertJsonPath('data.lines.0.reserved_quantity', '6.00')
            ->assertJsonPath('data.lines.0.backordered_quantity', '4.00')
            ->assertJsonPath('summary.total_reserved', 6)
            ->assertJsonPath('summary.total_backordered', 4);

        $line = $so->lines()->first();
        $this->assertEquals(6.00, (float) $line->reserved_quantity);
        $this->assertEquals(4.00, (float) $line->backordered_quantity);

        $this->assertDatabaseHas('stock_reservations', [
            'chapter_id' => $this->chapterId,
            'source_type' => 'SO',
            'source_id' => $so->id,
            'source_line_id' => $line->id,
            'quantity' => 6.00,
            'status' => 'ACTIVE',
        ]);

        $reservation = StockReservation::where('source_id', $so->id)->first();
        $this->assertNotNull($reservation);
        $this->assertNotNull($reservation->expires_at);
        $this->assertTrue(
            $reservation->expires_at->isAfter(now()->addHours(47)) &&
            $reservation->expires_at->isBefore(now()->addHours(49))
        );
    }

    /**
     * Test 2: Full Availability Test (order 5 when 10 available -> 5 reserved, 0 backordered).
     */
    public function test_stock_splitting_full_availability(): void
    {
        $so = $this->createSalesOrderWithLines([
            [
                'variant_id' => 'VAR-CAP-BLK',
                'ordered_quantity' => 5,
            ],
        ]);

        $payload = [
            'available_stock' => [
                'VAR-CAP-BLK' => 10,
            ],
        ];

        $response = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/split-demand", $payload);

        $response->assertStatus(200)
            ->assertJsonPath('data.lines.0.reserved_quantity', '5.00')
            ->assertJsonPath('data.lines.0.backordered_quantity', '0.00')
            ->assertJsonPath('summary.total_reserved', 5)
            ->assertJsonPath('summary.total_backordered', 0);

        $this->assertDatabaseHas('stock_reservations', [
            'chapter_id' => $this->chapterId,
            'source_type' => 'SO',
            'source_id' => $so->id,
            'quantity' => 5.00,
            'status' => 'ACTIVE',
        ]);
    }

    /**
     * Test 3: Zero Availability Test (order 5 when 0 available -> 0 reserved, 5 backordered).
     */
    public function test_stock_splitting_zero_availability(): void
    {
        $so = $this->createSalesOrderWithLines([
            [
                'variant_id' => 'VAR-HOODIE-L',
                'ordered_quantity' => 5,
            ],
        ]);

        $payload = [
            'available_stock' => [
                'VAR-HOODIE-L' => 0,
            ],
        ];

        $response = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/split-demand", $payload);

        $response->assertStatus(200)
            ->assertJsonPath('data.lines.0.reserved_quantity', '0.00')
            ->assertJsonPath('data.lines.0.backordered_quantity', '5.00')
            ->assertJsonPath('summary.total_reserved', 0)
            ->assertJsonPath('summary.total_backordered', 5);

        // No active reservations created when 0 reserved
        $this->assertEquals(0, StockReservation::where('source_id', $so->id)->count());
    }

    /**
     * Test 4: Customer Contact Logging (saves contact log with method, timestamp, buyer response).
     */
    public function test_customer_contact_logging(): void
    {
        $so = $this->createSalesOrderWithLines([
            [
                'variant_id' => 'VAR-SHIRT-M-BLU',
                'ordered_quantity' => 10,
            ],
        ]);

        $payload = [
            'contact_method' => 'PHONE',
            'officer_id' => 'officer-sales-01',
            'buyer_response' => 'Customer agreed to wait for backorder shipment after discussing lead time.',
            'contact_timestamp' => '2026-11-03 14:30:00',
            'notes' => 'Spoke with church parish representative Mr. Santos.',
        ];

        $response = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/contact-logs", $payload);

        $response->assertStatus(201)
            ->assertJsonPath('data.contact_method', 'PHONE')
            ->assertJsonPath('data.officer_id', 'officer-sales-01')
            ->assertJsonPath('data.buyer_response', 'Customer agreed to wait for backorder shipment after discussing lead time.')
            ->assertJsonPath('data.so_id', $so->id);

        $this->assertDatabaseHas('customer_contact_logs', [
            'so_id' => $so->id,
            'contact_method' => 'PHONE',
            'officer_id' => 'officer-sales-01',
            'buyer_response' => 'Customer agreed to wait for backorder shipment after discussing lead time.',
        ]);

        $this->assertCount(1, $so->fresh()->contactLogs);
    }

    /**
     * Test 5: Buyer Decline Cancellation & Reservation Release (declining backorder cancels SO, releases reservations to RELEASED, creates audit revision with reason BUYER_DECLINED_TERMS per T-04).
     */
    public function test_buyer_decline_cancellation_and_reservation_release(): void
    {
        $so = $this->createSalesOrderWithLines([
            [
                'variant_id' => 'VAR-SHIRT-M-BLU',
                'ordered_quantity' => 10,
            ],
        ]);

        // First reserve 6 units
        $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/split-demand", [
            'available_stock' => ['VAR-SHIRT-M-BLU' => 6],
        ])->assertStatus(200);

        $this->assertDatabaseHas('stock_reservations', [
            'source_id' => $so->id,
            'quantity' => 6.00,
            'status' => 'ACTIVE',
        ]);

        // Buyer declines terms
        $declinePayload = [
            'acceptance_status' => 'DECLINED',
            'reason' => 'Customer refused waiting for 4-week backorder replenishment.',
            'officer_id' => 'officer-sales-02',
        ];

        $response = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/acceptance", $declinePayload);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'CANCELLED')
            ->assertJsonPath('data.buyer_acceptance_status', 'DECLINED');

        // Verify SO status is CANCELLED
        $freshSo = $so->fresh(['lines', 'reservations', 'revisions']);
        $this->assertEquals('CANCELLED', $freshSo->status);
        $this->assertEquals('DECLINED', $freshSo->buyer_acceptance_status);

        // Verify reserved_quantity is reset to 0 on active lines
        $this->assertEquals(0.00, (float) $freshSo->lines->first()->reserved_quantity);

        // Verify all active reservations for this SO were transitioned to RELEASED
        $this->assertDatabaseHas('stock_reservations', [
            'source_id' => $so->id,
            'status' => 'RELEASED',
        ]);
        $this->assertEquals(0, StockReservation::where('source_id', $so->id)->where('status', 'ACTIVE')->count());

        // Verify SalesOrderRevision created with reason BUYER_DECLINED_TERMS
        $this->assertDatabaseHas('sales_order_revisions', [
            'so_id' => $so->id,
            'reason' => 'BUYER_DECLINED_TERMS',
            'created_by' => 'officer-sales-02',
        ]);

        $revision = SalesOrderRevision::where('so_id', $so->id)->first();
        $this->assertNotNull($revision);
        $this->assertIsArray($revision->snapshot);
    }

    /**
     * Test 6: Chapter Scoping & Multitenancy (404/403 when accessing sales orders across different chapters).
     */
    public function test_chapter_scoping_and_multitenancy(): void
    {
        $so = $this->createSalesOrderWithLines([
            [
                'variant_id' => 'VAR-SHIRT-M-BLU',
                'ordered_quantity' => 10,
            ],
        ]);

        $foreignChapter = 'chap-manila-02';

        // 1. Demand split under wrong chapter returns 404
        $splitResponse = $this->postJson("/api/v1/chapters/{$foreignChapter}/sales-orders/{$so->id}/split-demand", [
            'available_stock' => ['VAR-SHIRT-M-BLU' => 6],
        ]);
        $splitResponse->assertStatus(404);

        // 2. Contact logs under wrong chapter returns 404
        $contactResponse = $this->postJson("/api/v1/chapters/{$foreignChapter}/sales-orders/{$so->id}/contact-logs", [
            'contact_method' => 'EMAIL',
            'officer_id' => 'officer-01',
            'buyer_response' => 'Acknowledged via email.',
        ]);
        $contactResponse->assertStatus(404);

        // 3. Acceptance recording under wrong chapter returns 404
        $acceptanceResponse = $this->postJson("/api/v1/chapters/{$foreignChapter}/sales-orders/{$so->id}/acceptance", [
            'acceptance_status' => 'FULL_ACCEPTED',
        ]);
        $acceptanceResponse->assertStatus(404);
    }

    /**
     * Test 7: Expiry Invariant (assert expires_at is set to exactly ~48 hours in future for active reservations).
     */
    public function test_reservation_48_hour_expiry_invariant(): void
    {
        $fixedNow = Carbon::parse('2026-11-03 09:00:00');
        Carbon::setTestNow($fixedNow);

        try {
            $so = $this->createSalesOrderWithLines([
                [
                    'variant_id' => 'VAR-JACKET-XL',
                    'ordered_quantity' => 8,
                ],
            ]);

            $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/split-demand", [
                'available_stock' => ['VAR-JACKET-XL' => 8],
            ])->assertStatus(200);

            $reservation = StockReservation::where('source_id', $so->id)->first();
            $this->assertNotNull($reservation);
            $this->assertEquals('2026-11-05 09:00:00', $reservation->expires_at->toDateTimeString());

            // Active query scope
            $this->assertEquals(1, StockReservation::active()->where('source_id', $so->id)->count());
            $this->assertEquals(0, StockReservation::expired()->where('source_id', $so->id)->count());

            // Advance time past 48 hours
            Carbon::setTestNow(Carbon::parse('2026-11-05 09:00:01'));
            $this->assertEquals(1, StockReservation::expired()->where('source_id', $so->id)->count());
        } finally {
            Carbon::setTestNow();
        }
    }

    /**
     * Additional Test: Buyer Acceptance for non-declined statuses (BACKORDER_ACCEPTED).
     */
    public function test_buyer_acceptance_backorder_accepted(): void
    {
        $so = $this->createSalesOrderWithLines([
            [
                'variant_id' => 'VAR-SHIRT-M-BLU',
                'ordered_quantity' => 10,
            ],
        ]);

        $response = $this->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/acceptance", [
            'acceptance_status' => 'BACKORDER_ACCEPTED',
            'reason' => 'Buyer agreed to wait for partial backorder.',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.buyer_acceptance_status', 'BACKORDER_ACCEPTED')
            ->assertJsonPath('data.status', 'SUBMITTED');

        $this->assertEquals('BACKORDER_ACCEPTED', $so->fresh()->buyer_acceptance_status);
        $this->assertEquals('SUBMITTED', $so->fresh()->status);
    }
}
