<?php

namespace Tests\Feature\Stage1B;

use App\Models\Buyer;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\DomainNotificationOutbox;
use App\Models\DutyGrant;
use App\Models\InventoryLot;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Models\StockReservation;
use App\Models\User;
use App\Services\Inventory\PhysicalPostingService;
use App\Services\Inventory\StockViewQueryService;
use App\Services\Notifications\DomainNotificationOutboxService;
use Exception;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class Stage1CrossDomainAndOutboxTest extends TestCase
{
    use RefreshDatabase;

    private string $chapterId;

    private string $foreignChapterId;

    private string $userId;

    private string $otherUserId;

    private string $unitId;

    private string $itemId;

    private string $variantId;

    private string $locationId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->chapterId = (string) Str::uuid();
        $this->foreignChapterId = (string) Str::uuid();
        $this->userId = (string) Str::uuid();
        $this->otherUserId = (string) Str::uuid();

        Chapter::create([
            'id' => $this->chapterId,
            'code' => 'SYN-CEB',
            'name' => 'Cebu Chapter',
            'status' => 'live',
            'version' => 1,
        ]);

        Chapter::create([
            'id' => $this->foreignChapterId,
            'code' => 'SYN-DVO',
            'name' => 'Davao Chapter',
            'status' => 'live',
            'version' => 1,
        ]);

        foreach ([$this->userId => 'user1@example.invalid', $this->otherUserId => 'user2@example.invalid'] as $uid => $email) {
            User::create([
                'id' => $uid,
                'public_id' => $email,
                'name' => 'Test User',
                'email' => $email,
                'password_hash' => hash('sha256', 'Pass123!'),
                'status' => 'active',
                'version' => 1,
            ]);
        }

        ChapterMembership::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'user_id' => $this->userId,
            'membership_status' => 'active',
            'version' => 1,
        ]);

        foreach (['INVENTORY_CUSTODIAN', 'INVENTORY', 'SALES_OFFICER', 'COMMITTEE_REQUESTER', 'RF_APPROVER'] as $duty) {
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

        $this->unitId = (string) Str::uuid();
        CatalogueUnit::create([
            'id' => $this->unitId,
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
            'code' => 'ITEM-SHIRT',
            'name' => 'Chapter Shirt',
            'unit_id' => $this->unitId,
            'state' => 'active',
            'material_version' => 1,
        ]);

        $this->variantId = (string) Str::uuid();
        CatalogueVariant::create([
            'id' => $this->variantId,
            'chapter_id' => $this->chapterId,
            'item_id' => $this->itemId,
            'sku' => 'VAR-SHIRT-M',
            'name' => 'Chapter Shirt M',
            'label' => 'Chapter Shirt M',
            'unit_id' => $this->unitId,
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

    public function test_live_sales_split_demand_without_override_and_so_cancel_release_and_print_escaping(): void
    {
        // Post 8 usable units into live inventory
        app(PhysicalPostingService::class)->createPosting(
            $this->chapterId,
            'IPC',
            (string) Str::uuid(),
            $this->userId,
            [[
                'variant_id' => $this->variantId,
                'unit_id' => $this->unitId,
                'location_id' => $this->locationId,
                'condition' => 'USABLE',
                'custody' => 'STOCKROOM',
                'lot_code' => 'LOT-SO-1',
                'quantity' => 8,
            ]]
        );

        $lot = InventoryLot::where('chapter_id', $this->chapterId)->firstOrFail();

        // Place an active hold on 2 units [0, 2) -> available_to_allocate becomes 6
        $this->withHeaders([
            'X-User-Id' => $this->userId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/stock-holds", [
            'targets' => [[
                'stock_lot_id' => $lot->id,
                'basis_segment_id' => $lot->basis_segment_id,
                'offset_quantity' => '0',
                'quantity' => '2',
                'expected_lot_material_version' => $lot->material_version,
                'expected_stock_version' => $lot->stock_version,
            ]],
            'reason_code' => 'damage_review',
            'reason' => '2 units held',
        ])->assertStatus(201);

        // Create buyer with XSS payload in name to verify print escaping
        $buyer = Buyer::create([
            'chapter_id' => $this->chapterId,
            'name' => '<script>alert("xss")</script>Parish',
        ]);

        $so = SalesOrder::create([
            'chapter_id' => $this->chapterId,
            'so_number' => 'SO-LIVE-001',
            'buyer_id' => $buyer->id,
            'order_date' => '2026-11-10',
            'target_delivery_date' => '2026-11-20',
            'status' => 'SUBMITTED',
            'created_by' => $this->userId,
        ]);

        SalesOrderLine::create([
            'so_id' => $so->id,
            'variant_id' => $this->variantId,
            'unit_id' => $this->unitId,
            'ordered_quantity' => 10,
            'unit_price' => 100.00,
            'line_total' => 1000.00,
            'line_status' => 'ACTIVE',
        ]);

        // Call split-demand WITHOUT available_stock override -> must read live inventory (6 available)
        $splitResp = $this->withHeaders([
            'X-User-Id' => $this->userId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/split-demand", [])
            ->assertStatus(200)
            ->assertJsonPath('summary.total_reserved', 6)
            ->assertJsonPath('summary.total_backordered', 4);

        $this->assertEquals(0.0, app(StockViewQueryService::class)->getRawMetrics($this->chapterId, $this->variantId)['available_to_allocate']);

        // Print SO escapes HTML & sets Cache-Control: no-store
        $printResp = $this->withHeaders(['X-User-Id' => $this->userId])
            ->getJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/print")
            ->assertStatus(200);
        $this->assertStringContainsString('no-store', (string) $printResp->headers->get('Cache-Control'));
        $html = (string) $printResp->json('data.printable_html');
        $this->assertStringNotContainsString('<script>', $html);
        $this->assertStringContainsString('&lt;script&gt;', $html);

        // Cancel SO -> releases active SO reservations, resets reserved_quantity=0, writes SalesOrderRevision
        $this->withHeaders([
            'X-User-Id' => $this->userId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->postJson("/api/v1/chapters/{$this->chapterId}/sales-orders/{$so->id}/cancel", [
            'reason' => 'Buyer withdrew',
        ])->assertStatus(200);

        $this->assertSame(0, StockReservation::where('source_id', $so->id)->where('status', 'ACTIVE')->count());
        $this->assertDatabaseHas('sales_order_lines', [
            'so_id' => $so->id,
            'reserved_quantity' => 0,
            'line_status' => 'CANCELLED',
        ]);
        $this->assertDatabaseHas('sales_order_revisions', [
            'so_id' => $so->id,
            'reason' => 'Buyer withdrew',
        ]);
        $this->assertEquals(6.0, app(StockViewQueryService::class)->getRawMetrics($this->chapterId, $this->variantId)['available_to_allocate']);
    }

    public function test_catalogue_unit_quantity_identity_locked_after_stock_posting(): void
    {
        $unit = CatalogueUnit::findOrFail($this->unitId);
        $this->assertFalse($unit->quantity_identity_locked);

        app(PhysicalPostingService::class)->createPosting(
            $this->chapterId,
            'IPC',
            (string) Str::uuid(),
            $this->userId,
            [[
                'variant_id' => $this->variantId,
                'unit_id' => $this->unitId,
                'location_id' => $this->locationId,
                'condition' => 'USABLE',
                'custody' => 'STOCKROOM',
                'lot_code' => 'LOT-LOCK',
                'quantity' => 5,
            ]]
        );

        $this->assertTrue($unit->fresh()->quantity_identity_locked);

        $this->withHeaders([
            'X-User-Id' => $this->userId,
            'X-Action-Key' => (string) Str::uuid(),
        ])->putJson("/api/v1/chapters/{$this->chapterId}/catalogue/units/{$this->unitId}", [
            'expected_material_version' => 1,
            'quantity_kind' => 'measured',
            'quantity_scale' => 2,
            'reason' => 'Attempt illegal scale mutation',
        ])->assertStatus(422)
            ->assertJsonPath('error.code', 'quantity_identity_locked');
    }

    public function test_notification_subscription_auth_and_channel_fences(): void
    {
        // Unauthenticated -> 401
        $this->postJson('/api/v1/auth/notification-subscriptions/authorize', [
            'socket_id' => '123.456',
            'channel_name' => "private-stage1.user.{$this->userId}",
        ])->assertStatus(401);

        // Foreign user channel -> 403
        $this->withHeaders(['X-User-Id' => $this->userId])
            ->postJson('/api/v1/auth/notification-subscriptions/authorize', [
                'socket_id' => '123.456',
                'channel_name' => "private-stage1.user.{$this->otherUserId}",
            ])->assertStatus(403);

        // Wildcard channel -> 403
        $this->withHeaders(['X-User-Id' => $this->userId])
            ->postJson('/api/v1/auth/notification-subscriptions/authorize', [
                'socket_id' => '123.456',
                'channel_name' => 'private-stage1.user.*',
            ])->assertStatus(403);

        // Valid session channel -> 200 with Cache-Control: no-store
        $sessResp = $this->withHeaders(['X-User-Id' => $this->userId])
            ->postJson('/api/v1/auth/notification-subscriptions/authorize', [
                'socket_id' => '123.456',
                'channel_name' => "private-stage1.user.{$this->userId}",
            ])->assertStatus(200)
            ->assertJsonStructure(['auth']);
        $this->assertStringContainsString('no-store', (string) $sessResp->headers->get('Cache-Control'));

        // Valid chapter channel -> 200
        $chapResp = $this->withHeaders(['X-User-Id' => $this->userId])
            ->postJson("/api/v1/chapters/{$this->chapterId}/notification-subscriptions/authorize", [
                'socket_id' => '123.456',
                'channel_name' => "private-stage1.chapter.{$this->chapterId}.user.{$this->userId}",
            ])->assertStatus(200)
            ->assertJsonStructure(['auth']);
        $this->assertStringContainsString('no-store', (string) $chapResp->headers->get('Cache-Control'));

        // Non-member chapter channel -> 403
        $this->withHeaders(['X-User-Id' => $this->userId])
            ->postJson("/api/v1/chapters/{$this->foreignChapterId}/notification-subscriptions/authorize", [
                'socket_id' => '123.456',
                'channel_name' => "private-stage1.chapter.{$this->foreignChapterId}.user.{$this->userId}",
            ])->assertStatus(403);

        // Foreign chapter channel name inside authorized chapter -> 403
        $this->withHeaders(['X-User-Id' => $this->userId])
            ->postJson("/api/v1/chapters/{$this->chapterId}/notification-subscriptions/authorize", [
                'socket_id' => '123.456',
                'channel_name' => "private-stage1.chapter.{$this->foreignChapterId}.user.{$this->userId}",
            ])->assertStatus(403);
    }

    public function test_outbox_dispatches_on_commit_and_writes_zero_rows_on_rollback(): void
    {
        /** @var DomainNotificationOutboxService $outbox */
        $outbox = app(DomainNotificationOutboxService::class);
        $resId = (string) Str::uuid();

        // 1. Rollback leaves ZERO outbox rows
        try {
            DB::transaction(function () use ($outbox, $resId) {
                $outbox->recordIntent('stage1.internal-rf.changed.v1', $this->chapterId, $resId, 1, 1);
                throw new Exception('Force rollback');
            });
        } catch (Exception) {
            // Expected
        }

        $this->assertSame(0, DomainNotificationOutbox::where('resource_id', $resId)->count());

        // 2. Commit marks outbox row 'dispatched' with strict 8-field public envelope
        $committedResId = (string) Str::uuid();
        DB::transaction(function () use ($outbox, $committedResId) {
            $outbox->recordIntent('stage1.internal-rf.changed.v1', $this->chapterId, $committedResId, 2, 1);
        });

        $row = DomainNotificationOutbox::where('resource_id', $committedResId)->first();
        $this->assertNotNull($row);
        $this->assertSame('dispatched', $row->status);
        $this->assertNotNull($row->dispatched_at);
        $this->assertSame([
            'event_name',
            'event_id',
            'committed_at',
            'chapter_id',
            'resource_kind',
            'resource_id',
            'resource_version',
            'material_version',
        ], array_keys($row->payload_json));
    }

    public function test_unauthenticated_chapter_requests_return_401(): void
    {
        $this->flushHeaders();

        $this->getJson("/api/v1/chapters/{$this->chapterId}/sales-orders")
            ->assertStatus(401)
            ->assertJsonPath('error', 'AUTHENTICATION_REQUIRED');

        $this->getJson("/api/v1/chapters/{$this->chapterId}/stock")
            ->assertStatus(401)
            ->assertJsonPath('error', 'AUTHENTICATION_REQUIRED');
    }
}
