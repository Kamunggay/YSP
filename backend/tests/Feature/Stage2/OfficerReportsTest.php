<?php

namespace Tests\Feature\Stage2;

use App\Models\AuditLog;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\InternalRf;
use App\Models\InventoryLot;
use App\Models\PolicyRecord;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderLine;
use App\Models\ReceivingHold;
use App\Models\Repf;
use App\Models\RepfLine;
use App\Models\Stage2RecordHistory;
use App\Models\User;
use App\Services\Shared\CanonicalJson;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\TestCase;

class OfficerReportsTest extends TestCase
{
    use AuthenticatesBrowserOfficer, RefreshDatabase;

    public function test_live_alerts_are_duty_filtered_and_disappear_after_approval(): void
    {
        $chapter = Chapter::create(['code' => 'ALERTS', 'name' => 'Officer alerts']);
        $officer = $this->officer($chapter, 'BUDGET_APPROVER');
        $repf = Repf::create(['chapter_id' => $chapter->id, 'prepared_by' => $officer->id, 'status' => 'pending_budget_review']);
        Repf::create(['chapter_id' => Chapter::create(['code' => 'OTHER', 'name' => 'Other chapter'])->id, 'prepared_by' => $officer->id, 'status' => 'pending_budget_review']);
        $url = "/api/v1/chapters/{$chapter->id}/alerts";

        $this->asBrowserOfficer($officer->id)->get($url)
            ->assertOk()->assertHeader('Cache-Control', 'no-store')
            ->assertJsonPath('persisted_ack_supported', false)
            ->assertJsonPath('caller_matched_duties', ['BUDGET_APPROVER'])
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.alert_key', "repf_pending_approval:repf:{$repf->id}");
        $this->get($url.'?responsible_duty=INVENTORY')->assertOk()->assertJsonCount(0, 'data');
        $repf->update(['status' => 'approved']);
        $this->get($url)->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_report_prints_share_authorization_and_strict_selectors(): void
    {
        $chapter = Chapter::create(['code' => 'PRINT', 'name' => '<script>chapter</script>']);
        $officer = $this->officer($chapter, 'INVENTORY');
        $denied = $this->officer($chapter, 'RF_APPROVER');
        $foreign = Chapter::create(['code' => 'FOREIGN', 'name' => 'Foreign chapter']);
        $location = CatalogueLocation::create(['chapter_id' => $foreign->id, 'code' => 'FOREIGN', 'name' => 'Foreign stockroom']);
        $base = "/api/v1/chapters/{$chapter->id}/reports";
        $period = 'date_from=2026-01-01&date_to=2026-12-31';

        foreach (['inventory', 'procurement', 'control'] as $kind) {
            $this->asBrowserOfficer($officer->id)->get("$base/$kind?$period")->assertOk()
                ->assertHeader('Cache-Control', 'no-store')
                ->assertJsonPath('metadata.currency_code', 'PHP');
            $this->get("$base/$kind/print?$period")->assertOk()
                ->assertHeader('Cache-Control', 'no-store')
                ->assertHeader('X-Content-Type-Options', 'nosniff')
                ->assertHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
                ->assertSee('<script>chapter</script>')
                ->assertDontSee('<script>chapter</script>', false)
                ->assertSee('Philippine Peso (PHP)');
            foreach (['', '/print'] as $suffix) {
                $url = "$base/$kind$suffix";
                foreach ([
                    'date_from=2026-02-01&date_to=2026-01-01',
                    'date_from=2026-02-30&date_to=2026-03-01',
                    'date_from=2026-01-01&date_to=2027-01-03',
                    "$period&date_to=2026-12-30", "$period&status=invalid", "$period&unexpected=1",
                ] as $invalid) {
                    $this->get("$url?$invalid")->assertBadRequest()->assertJsonPath('error.code', 'invalid_selector');
                }
                $this->get("$url?$period&location_id={$location->id}")->assertNotFound()
                    ->assertJsonPath('error.code', 'resource_not_found');
                $this->asBrowserOfficer($denied->id)->get("$url?$period")->assertForbidden()->assertJsonPath('error.code', 'duty_denied');
                $this->asBrowserOfficer($officer->id);
            }
        }
    }

    public function test_reports_page_in_lockstep_and_expire_or_reject_changed_sections(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-28T18:30:00Z'));
        $chapter = Chapter::create(['code' => 'SNAPSHOT', 'name' => 'Snapshot chapter']);
        $officer = $this->officer($chapter, 'INVENTORY');
        $unit = CatalogueUnit::create(['chapter_id' => $chapter->id, 'code' => 'PCS', 'name' => 'Pieces', 'quantity_kind' => 'counted']);
        $item = CatalogueItem::create(['chapter_id' => $chapter->id, 'unit_id' => $unit->id, 'code' => 'KIT', 'name' => 'Kit']);
        $variant = CatalogueVariant::create([
            'chapter_id' => $chapter->id, 'item_id' => $item->id, 'unit_id' => $unit->id, 'code' => 'KIT-1', 'label' => 'Kit',
        ]);
        $repf = Repf::create([
            'chapter_id' => $chapter->id, 'prepared_by' => $officer->id, 'status' => 'pending_budget_review',
            'review_json' => ['submitted_at' => '2026-11-27T15:30:00.000000Z'],
        ]);
        $line = RepfLine::create([
            'repf_id' => $repf->id, 'line_number' => 1, 'item_id' => $item->id, 'variant_id' => $variant->id, 'unit_id' => $unit->id,
            'quantity_scale' => 0, 'trigger_kind' => 'rop_replenishment', 'requested_quantity' => '1', 'remaining_to_order_quantity' => '1',
            'estimated_unit_cost_php' => '12.50', 'estimated_line_total_php' => '12.50', 'net_need_breakdown' => [],
        ]);
        $purchaseOrders = collect(['issued', 'pending_approval'])->map(fn ($status) => PurchaseOrder::create([
            'chapter_id' => $chapter->id, 'prepared_by' => $officer->id, 'repf_id' => $repf->id, 'status' => $status,
            'supplier_selection_id' => (string) Str::uuid(), 'supplier' => ['supplier_name' => 'Supplier'],
            'delivery_location' => 'Main stockroom', 'expected_delivery_date' => '2026-11-20', 'revised_expected_delivery_date' => '2026-11-28',
            'payment_and_delivery_terms' => 'On delivery', 'total_amount_php' => '12.50',
            'review_json' => ['submitted_at' => '2026-11-27T16:30:00.000000Z'],
        ]));
        foreach ($purchaseOrders as $po) {
            PurchaseOrderLine::create([
                'po_id' => $po->id, 'repf_id' => $repf->id, 'repf_line_id' => $line->id, 'variant_id' => $variant->id, 'unit_id' => $unit->id,
                'quantity_scale' => 0, 'ordered_quantity' => '1', 'outstanding_quantity' => '1', 'unit_price_php' => '12.50', 'line_total_php' => '12.50',
            ]);
        }
        $history = fn (int $sequence) => Stage2RecordHistory::create([
            'chapter_id' => $chapter->id, 'record_kind' => 'repf', 'record_id' => $repf->id, 'sequence_no' => $sequence,
            'version' => $sequence, 'material_version' => 1, 'is_version_snapshot' => true, 'event_type' => 'submitRepf',
            'actor_user_id' => $officer->id, 'snapshot_json' => ['status' => 'pending_budget_review'], 'recorded_at' => now('UTC'),
        ]);
        $history(1);
        $history(2);
        $base = "/api/v1/chapters/{$chapter->id}/reports";
        $period = 'date_from=2026-11-01&date_to=2026-11-30';
        $control = "$base/control?$period&limit=1";
        $procurement = "$base/procurement?$period&limit=1";
        $this->asBrowserOfficer($officer->id);

        $exceptions = collect($this->get("$base/control?$period")->assertOk()->json('overdue_exceptions'))->keyBy('exception_kind');
        $this->assertSame(3, $exceptions['overdue_repf_approval']['overdue_hours']);
        $this->assertSame(2, $exceptions['overdue_po_approval']['overdue_hours']);
        $this->assertSame(3, $exceptions['overdue_po_delivery']['overdue_hours']);
        $this->assertSame('2026-11-28T15:59:59.999999Z', $exceptions['overdue_po_delivery']['due_or_since_at']);
        $first = $this->get($control)->assertOk()->assertJsonCount(1, 'audit_history')->assertJsonCount(1, 'overdue_exceptions');
        $cursor = $first->json('page.next_cursor');
        $this->assertIsString($cursor);
        $controlNext = $control.'&cursor='.rawurlencode($cursor);
        $second = $this->get($controlNext)->assertOk()->assertJsonCount(1, 'audit_history')->assertJsonCount(1, 'overdue_exceptions')
            ->assertJsonPath('page.snapshot_version', $first->json('page.snapshot_version'));
        $this->assertNotSame($first->json('audit_history.0.event_id'), $second->json('audit_history.0.event_id'));
        $history(3);
        $this->get($controlNext)->assertConflict()->assertJsonPath('error.code', 'snapshot_stale');

        $first = $this->get($procurement)->assertOk()->assertJsonCount(1, 'repf_summary')->assertJsonCount(1, 'purchase_order_summary');
        $procurementNext = $procurement.'&cursor='.rawurlencode($first->json('page.next_cursor'));
        $this->get($procurementNext)->assertOk()->assertJsonCount(0, 'repf_summary')->assertJsonCount(1, 'purchase_order_summary')
            ->assertJsonPath('page.next_cursor', null);
        $this->travel(5)->minutes();
        $this->get($procurementNext)->assertConflict()->assertJsonPath('error.code', 'snapshot_stale');
    }

    public function test_low_stock_shortage_and_missing_source_alerts_follow_current_state(): void
    {
        $this->freezeTime();
        $chapter = Chapter::create(['code' => 'STOCK', 'name' => 'Stock chapter']);
        $officer = $this->officer($chapter, 'INVENTORY');
        $location = CatalogueLocation::create(['chapter_id' => $chapter->id, 'code' => 'MAIN', 'name' => 'Stockroom']);
        $unit = CatalogueUnit::create(['chapter_id' => $chapter->id, 'code' => 'PCS', 'name' => 'Pieces', 'quantity_kind' => 'counted']);
        $item = CatalogueItem::create(['chapter_id' => $chapter->id, 'unit_id' => $unit->id, 'code' => 'KIT', 'name' => 'Kit']);
        $variant = CatalogueVariant::create([
            'chapter_id' => $chapter->id, 'item_id' => $item->id, 'unit_id' => $unit->id, 'code' => 'KIT-1', 'label' => 'Kit',
        ]);
        $this->threshold($chapter, $officer, $item, 'rop', '5');
        $this->threshold($chapter, $officer, $item, 'target_level', '20');
        $lot = InventoryLot::create([
            'chapter_id' => $chapter->id, 'variant_id' => $variant->id, 'unit_id' => $unit->id, 'location_id' => $location->id,
            'condition' => 'USABLE', 'custody' => 'STOCKROOM', 'quantity_on_hand' => '5',
        ]);
        $rf = InternalRf::create([
            'chapter_id' => $chapter->id, 'requester_user_id' => $officer->id, 'requesting_unit_id' => (string) Str::uuid(),
            'rf_number' => 'RF-TEST', 'status' => 'approved', 'fulfillment_status' => 'partially_issued',
            'needed_at' => now()->addDay(), 'approved_at' => now(),
        ]);
        $line = $rf->lines()->create([
            'variant_id' => $variant->id, 'unit_id' => $unit->id, 'line_order' => 1,
            'requested_quantity' => '10', 'approved_quantity' => '10', 'issued_quantity' => '2',
            'reserved_quantity' => '4', 'canceled_quantity' => '1',
        ]);
        $hold = ReceivingHold::create([
            'chapter_id' => $chapter->id, 'status' => 'held', 'arrived_at' => now()->subHours(26),
            'holding_location_id' => $location->id, 'carrier_or_sender_name' => 'Carrier',
            'sender_kind' => 'carrier', 'hold_reason' => 'Missing source', 'items' => [['variant_id' => $variant->id]],
            'recorded_by' => $officer->id,
        ]);

        $base = "/api/v1/chapters/{$chapter->id}";
        $alerts = $this->asBrowserOfficer($officer->id)->get("$base/alerts")->assertOk()->json('data');
        $this->assertSame(['low_stock_rop', 'active_missing_source_hold', 'open_rf_shortage'], array_column($alerts, 'alert_type'));
        $from = now('Asia/Manila')->subDays(3)->toDateString();
        $to = now('Asia/Manila')->toDateString();
        $period = "date_from=$from&date_to=$to";
        $this->get("$base/reports/inventory?$period")->assertOk()
            ->assertJsonPath('data.0.approved_rop', '5')
            ->assertJsonPath('data.0.approved_target', '20')
            ->assertJsonPath('data.0.low_stock_breach', true)
            ->assertJsonPath('data.0.unreserved_rf_shortage', '3');
        $this->get("$base/reports/procurement?$period")->assertOk()
            ->assertJsonPath('rf_demand_summary.0.issued_quantity', '2')
            ->assertJsonPath('rf_demand_summary.0.canceled_quantity', '1')
            ->assertJsonPath('rf_demand_summary.0.outstanding_quantity', '7')
            ->assertJsonPath('rf_demand_summary.0.active_reserved_quantity', '4');
        $this->get("$base/reports/control?$period&status=hold_open")->assertOk()
            ->assertJsonPath('overdue_exceptions.0.record_id', $hold->id)
            ->assertJsonPath('overdue_exceptions.0.overdue_hours', 2);

        $lot->update(['quantity_on_hand' => '6']);
        $line->update(['reserved_quantity' => '7']);
        $hold->update(['status' => 'linked_to_source']);
        $this->get("$base/alerts")->assertOk()->assertJsonCount(0, 'data');
    }

    private function threshold(Chapter $chapter, User $officer, CatalogueItem $item, string $code, string $quantity): void
    {
        $rules = ['unit_id' => $item->unit_id, 'quantity' => $quantity];
        $policy = PolicyRecord::create([
            'chapter_id' => $chapter->id, 'policy_code' => $code, 'policy_version' => 1,
            'rules_json' => $rules, 'effective_from' => now()->subDay(),
        ]);
        AuditLog::create([
            'chapter_id' => $chapter->id, 'user_id' => $officer->id, 'action' => 'controlled:recordPolicy',
            'entity_type' => 'policy', 'entity_id' => $policy->id,
            'details' => [
                'version' => 1, 'subject_id' => $item->id, 'value_sha256' => CanonicalJson::sha256($rules),
                'value_schema_reference' => '#/components/schemas/CatalogueThresholdPolicyValue',
                'approvals' => [['authority' => 'CHAPTER_HEAD', 'approver_id' => $officer->id]],
            ],
        ]);
    }

    private function officer(Chapter $chapter, string $duty): User
    {
        $user = User::create(['name' => 'Test officer', 'public_id' => (string) Str::uuid(), 'email' => Str::uuid().'@example.invalid', 'password_hash' => bcrypt('password')]);
        $user->memberships()->create(['chapter_id' => $chapter->id]);
        $user->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => $duty]);

        return $user;
    }
}
