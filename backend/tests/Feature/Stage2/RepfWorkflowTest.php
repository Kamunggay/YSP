<?php

namespace Tests\Feature\Stage2;

use App\Models\AuditLog;
use App\Models\CatalogueItem;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\DomainNotificationOutbox;
use App\Models\InternalRf;
use App\Models\PolicyRecord;
use App\Models\User;
use App\Services\Inventory\Participants\NetShortageSnapshotParticipant;
use App\Services\Notifications\NotificationSubjectRead;
use App\Services\Shared\CanonicalJson;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\Feature\Stage2\Fixtures\RepfShortageSnapshot;
use Tests\TestCase;

class RepfWorkflowTest extends TestCase
{
    use AuthenticatesBrowserOfficer, RefreshDatabase;

    public function test_repf_rejects_stage_three_trigger_in_body_and_selectors(): void
    {
        $chapter = Chapter::create(['id' => (string) Str::uuid(), 'code' => 'SYN-REPF', 'name' => 'Replenishment chapter']);
        $actor = $this->officer($chapter, ['INVENTORY']);
        $url = "/api/v1/chapters/{$chapter->id}/repfs";

        $this->asBrowserOfficer($actor->id, (string) Str::uuid())->postJson($url, [
            'funding_source' => 'chapter_funds',
            'urgency' => 'normal',
            'justification' => 'Restock',
            'lines' => [[
                'trigger_kind' => 'so_shortage',
                'variant_id' => (string) Str::uuid(),
                'unit_id' => (string) Str::uuid(),
                'rf_id' => null, 'rf_line_id' => null,
                'requested_quantity' => '1',
                'estimated_unit_cost_php' => '10.00',
                'needed_by' => null, 'additional_purchase_reason' => null, 'notes' => null,
            ]],
        ])->assertUnprocessable()->assertJsonPath('error.code', 'invalid_input')
            ->assertJsonPath('error.fields.0.pointer', '/lines/0/trigger_kind')
            ->assertJsonPath('error.fields.0.code', 'invalid_format');

        $this->asBrowserOfficer($actor->id)->get($url.'?trigger_kind=so_shortage')
            ->assertBadRequest()->assertJsonPath('error.code', 'invalid_selector')->assertHeader('Cache-Control', 'no-store');
        $this->asBrowserOfficer($actor->id)->get($url.'?q=%ZZ')->assertBadRequest()->assertJsonPath('error.code', 'invalid_selector');
    }

    public function test_repf_lifecycle_recovers_exact_receipts_and_retains_one_reference(): void
    {
        [$chapter, $preparer, $url, $body, $shortage] = $this->scenario(['INVENTORY', 'BUDGET_APPROVER']);
        $reviewer = $this->officer($chapter, ['BUDGET_APPROVER'], '9.99');
        $key = (string) Str::uuid();
        $body['justification'] = '<script>alert(1)</script>';
        $draft = $this->write($preparer, $url, $body, $key)->assertCreated()->assertHeader('X-Action-Replayed', 'false');
        $draft->assertJsonPath('data.result.lines.0.needed_by', '2027-01-01T09:08:07.654321Z')
            ->assertJsonPath('data.result.lines.0.estimated_line_total_php', '10.00')
            ->assertJsonPath('data.result.lines.0.net_need_breakdown.uncovered_need', '4.00');
        $id = $draft->json('data.resource_id');
        $url .= '/'.$id;
        $base = "/api/v1/chapters/{$chapter->id}";
        $operationId = $draft->json('data.operation_id');

        $this->assertNull($shortage->calls[0]['exclude_repf_id']);
        $this->assertTrue($shortage->calls[0]['require_rop_and_target_policies']);
        $this->write($preparer, "$base/repfs", $body, $key)->assertCreated()->assertHeader('X-Action-Replayed', 'true')
            ->assertExactJson($draft->json());
        $this->write($preparer, "$base/repfs", array_replace($body, ['urgency' => 'urgent']), $key)
            ->assertConflict()->assertJsonPath('error.code', 'action_key_conflict');
        $byKey = "$base/procurement-operations/by-key?operation_name=createRepf&action_key=$key";
        $this->asBrowserOfficer($preparer->id)->get($byKey)->assertOk()->assertExactJson($draft->json());
        $this->asBrowserOfficer($preparer->id)->get("$base/procurement-operations/$operationId")->assertOk()->assertExactJson($draft->json());
        $this->asBrowserOfficer($reviewer->id)->get($byKey)->assertNotFound()->assertJsonPath('error.code', 'operation_not_found');

        $this->write($preparer, "$url/submit", $this->version(1, 1))->assertConflict()
            ->assertJsonPath('error.code', 'setup_blocked')->assertJsonPath('setup_blockers.0.setting_key', 'reference_series');
        $series = $this->series($chapter, $reviewer);
        $number = 'REPF-'.now('Asia/Manila')->year.'-000001';
        $this->write($preparer, "$url/submit", $this->version(1, 1))->assertOk()
            ->assertJsonPath('data.result.repf_reference', $number);
        $this->assertSame($id, $shortage->calls[2]['exclude_repf_id']);
        $this->write($preparer, "$url/budget-review", $this->version(2, 1) + ['decision' => 'approve', 'reason' => null])
            ->assertForbidden()->assertJsonPath('error.code', 'independence_required');
        $this->write($reviewer, "$url/budget-review", $this->version(2, 1) + ['decision' => 'approve', 'reason' => null])
            ->assertForbidden()->assertJsonPath('error.code', 'duty_limit_exceeded');
        $this->write($reviewer, "$url/budget-review", $this->version(2, 1) + ['decision' => 'hold', 'reason' => '  '])
            ->assertUnprocessable();
        $this->write($preparer, "$url/cancel", $this->version(2, 1) + ['reason' => 'Pending review'])
            ->assertConflict()->assertJsonPath('error.code', 'invalid_transition');

        $this->write($reviewer, "$url/budget-review", $this->version(2, 1) + ['decision' => 'hold', 'reason' => 'Confirm balance'])
            ->assertOk()->assertJsonPath('data.result.status', 'held');
        $this->write($reviewer, "$url/budget-review", $this->version(3, 1) + ['decision' => 'reject', 'reason' => 'Insufficient funds'])
            ->assertConflict()->assertJsonPath('error.code', 'invalid_transition');
        $this->write($preparer, "$url/resume-review", $this->version(3, 1) + ['reason' => null])
            ->assertForbidden()->assertJsonPath('error.code', 'independence_required');
        $this->write($reviewer, "$url/resume-review", $this->version(3, 1) + ['reason' => null])
            ->assertOk()->assertJsonPath('data.result.status', 'pending_budget_review');
        $this->write($reviewer, "$url/budget-review", $this->version(4, 1) + ['decision' => 'return', 'reason' => 'Correct notes'])
            ->assertOk()->assertJsonPath('data.result.status', 'returned_for_revision');
        $this->write($preparer, "$url/revise", $this->version(5, 1) + ['reason' => null])->assertOk()
            ->assertJsonPath('data.result.material_version', 2);

        $edit = $this->version(6, 2) + array_replace($body, ['urgency' => 'urgent']);
        $this->asBrowserOfficer($preparer->id, (string) Str::uuid())->putJson($url, $edit)->assertOk()
            ->assertJsonPath('data.result.material_version', 3);
        $this->asBrowserOfficer($preparer->id, (string) Str::uuid())->putJson($url, $edit)
            ->assertConflict()->assertJsonPath('error.code', 'version_conflict')->assertJsonPath('current.version', 7);

        $series->update(['effective_until' => now()->subSecond()]);
        $this->write($preparer, "$url/submit", $this->version(7, 3))->assertOk()
            ->assertJsonPath('data.result.repf_reference', $number);
        $this->assertDatabaseHas('reference_sequences', ['chapter_id' => $chapter->id, 'document_kind' => 'REPF', 'last_sequence' => 1]);

        $reviewer->dutyGrants()->update(['scope' => json_encode(['limit_php' => '10.00'], JSON_THROW_ON_ERROR)]);
        $this->write($reviewer, "$url/budget-review", $this->version(8, 3) + ['decision' => 'approve', 'reason' => null])
            ->assertOk()->assertJsonPath('data.result.approved_budget_php', '10.00');
        $this->asBrowserOfficer($preparer->id)->get("$url/versions/1")->assertOk()
            ->assertExactJson(['data' => $draft->json('data.result')]);

        $print = $this->asBrowserOfficer($reviewer->id)->get("$url/print")->assertOk()
            ->assertHeader('Cache-Control', 'no-store')->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        $print->assertSee('&lt;script&gt;alert(1)&lt;/script&gt;', false)->assertDontSee('<script>', false);

        DB::table('repfs')->where('id', $id)->update(['status' => 'partially_ordered']);
        DB::table('repf_lines')->where('repf_id', $id)->update(['ordered_quantity' => '0.40', 'remaining_to_order_quantity' => '0.60']);
        $this->write($this->officer($chapter, ['INVENTORY']), "$url/cancel", $this->version(9, 3) + ['reason' => 'No longer needed'])
            ->assertForbidden()->assertJsonPath('error.code', 'duty_denied');
        $this->write($reviewer, "$url/cancel", $this->version(9, 3) + ['reason' => 'No longer needed'])->assertOk()
            ->assertJsonPath('data.result.lines.0.ordered_quantity', '0.40')
            ->assertJsonPath('data.result.lines.0.canceled_quantity', '0.60')
            ->assertJsonPath('data.result.lines.0.remaining_to_order_quantity', '0.00');
        $this->asBrowserOfficer($reviewer->id)->get("$url/history")->assertOk()->assertJsonCount(10, 'data')
            ->assertJsonPath('data.9.action', 'cancelRepf');

        $events = DomainNotificationOutbox::where('chapter_id', $chapter->id)->orderBy('committed_at')->get();
        $this->assertCount(10, $events);
        $this->assertTrue(app(NotificationSubjectRead::class)->allows($reviewer, $events->last()));
        $preparer->dutyGrants()->where('duty_code', 'INVENTORY')->update(['status' => 'revoked']);
        $this->asBrowserOfficer($preparer->id)->get($byKey)->assertNotFound()->assertJsonPath('error.code', 'operation_not_found');
    }

    public function test_repf_blocks_live_excess_and_participant_failures_and_allows_an_explicit_override(): void
    {
        [$chapter, $actor, $url, $body, $shortage] = $this->scenario();
        $body['lines'][0]['requested_quantity'] = '4.01';
        foreach (['needed_by', 'additional_purchase_reason'] as $field) {
            $invalid = $body;
            $invalid['lines'][0][$field] = ' ';
            $this->write($actor, $url, $invalid)->assertUnprocessable()->assertJsonPath('error.fields.0.pointer', "/lines/0/$field");
        }
        $this->write($actor, $url, $body)->assertConflict()
            ->assertJsonPath('error.code', 'duplicate_supply_coverage')->assertJsonPath('current', null)
            ->assertJsonPath('failed_intent_committed', false)->assertJsonPath('coverage_conflicts.0.live_uncovered_need', '4.00')
            ->assertJsonPath('coverage_conflicts.0.blocking_inbound_sources.0.coverage_state', 'counted');

        $shortage->failure = ['outcome' => 'setup_blocked', 'blockers' => [[
            'setting_key' => 'rop', 'subject_id' => $body['lines'][0]['variant_id'], 'state' => 'expired',
            'approval_owner' => 'CHAPTER_HEAD', 'message' => 'ROP approval expired.',
        ]]];
        $this->write($actor, $url, $body)->assertConflict()->assertJsonPath('setup_blockers.0.state', 'expired');
        $shortage->failure = ['outcome' => 'rejected', 'code' => 'unavailable', 'message' => 'Participant unavailable.'];
        $this->write($actor, $url, $body)->assertServiceUnavailable()->assertJsonPath('error.code', 'unavailable');
        $this->assertDatabaseMissing('repfs', ['chapter_id' => $chapter->id]);
        $this->assertDatabaseMissing('domain_notification_outbox', ['chapter_id' => $chapter->id]);
        $shortage->failure = null;

        $body['lines'][0]['additional_purchase_reason'] = [
            'category' => 'late_supply', 'referenced_source_ids' => [], 'explanation' => 'Supply arrives after the event.',
        ];
        $this->write($actor, $url, $body)->assertCreated()
            ->assertJsonPath('data.result.has_additional_purchase_override', true)
            ->assertJsonPath('data.result.lines.0.net_need_breakdown.exceeds_uncovered_need', true);
        $this->write($actor, $url, $body)->assertCreated();

        $read = $this->asBrowserOfficer($actor->id);
        $list = $read->get("$url?limit=1&q=%20sYn%20&status=draft&trigger_kind=rop_replenishment")->assertOk()->assertJsonCount(1, 'data');
        $cursor = urlencode($list->json('page.next_cursor'));
        $read->get("$url?limit=1&status=draft&trigger_kind=rop_replenishment&q=SYN&cursor=$cursor")->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('page.next_cursor', null);
        $read->get("$url?limit=1&limit=1")->assertBadRequest()->assertJsonPath('error.code', 'invalid_selector');
        $this->travel(6)->minutes();
        $this->asBrowserOfficer($actor->id)->get("$url?limit=1&status=draft&trigger_kind=rop_replenishment&q=SYN&cursor=$cursor")
            ->assertConflict()->assertJsonPath('error.code', 'snapshot_stale');
    }

    public function test_repf_links_only_approved_same_chapter_rf_lines_and_checks_the_shared_trigger_bound(): void
    {
        [$chapter, $actor, $url, $body, $shortage] = $this->scenario();
        $rop = $body['lines'][0];
        $unitId = (string) Str::uuid();
        DB::table('chapter_organizational_units')->insert([
            'id' => $unitId, 'chapter_id' => $chapter->id, 'code' => 'OPS', 'name' => 'Operations',
        ]);
        $rf = InternalRf::create([
            'chapter_id' => $chapter->id, 'requester_user_id' => $actor->id, 'requesting_unit_id' => $unitId,
            'purpose' => 'chapter_operations', 'justification' => 'Event needs', 'needed_at' => now()->addDay(),
            'status' => 'approved', 'fulfillment_status' => 'outstanding', 'rf_number' => 'RF-001', 'approved_at' => now(),
        ]);
        $links = [];
        foreach ([1, 2] as $number) {
            $source = $rf->lines()->create([
                'line_order' => $number, 'variant_id' => $rop['variant_id'], 'unit_id' => $rop['unit_id'],
                'requested_quantity' => '1.50', 'approved_quantity' => '1.50',
            ]);
            $links[] = array_replace($rop, [
                'trigger_kind' => 'rf_shortage', 'rf_id' => $rf->id, 'rf_line_id' => $source->id, 'requested_quantity' => '1.50',
            ]);
            $shortage->rfLines[] = [
                'rf_id' => $rf->id, 'rf_reference' => $rf->rf_number, 'rf_line_id' => $source->id,
                'rf_material_version' => 1, 'requesting_unit_id' => $unitId,
                'needed_at' => '2027-01-01T00:00:00.000000Z', 'approved_quantity' => '1.50',
                'issued_quantity' => '0.00', 'canceled_quantity' => '0.00', 'active_reserved_quantity' => '0.00',
                'unreserved_outstanding_quantity' => '1.50',
            ];
        }

        $this->write($actor, $url, array_replace($body, ['lines' => [$links[0], $links[0]]]))->assertUnprocessable();
        $this->write($actor, $url, array_replace($body, ['lines' => [$rop, $rop]]))->assertUnprocessable();
        $this->write($actor, $url, array_replace($body, ['lines' => [array_replace($links[0], ['requested_quantity' => '1.51'])]]))
            ->assertConflict()->assertJsonPath('coverage_conflicts.0.live_uncovered_need', '1.50');
        $this->write($actor, $url, array_replace($body, ['lines' => $links]))->assertConflict()
            ->assertJsonPath('error.code', 'duplicate_supply_coverage')->assertJsonCount(2, 'coverage_conflicts');

        $draft = $this->write($actor, $url, array_replace($body, ['lines' => [$links[0], $rop]]))->assertCreated()
            ->assertJsonPath('data.result.lines.0.rf_reference', 'RF-001')
            ->assertJsonPath('data.result.lines.0.net_need_breakdown.uncovered_need', '2.00');
        $id = $draft->json('data.resource_id');
        $this->asBrowserOfficer($actor->id)->get("$url?rf_id={$rf->id}")->assertOk()->assertJsonCount(1, 'data');
        $this->asBrowserOfficer($actor->id)->get("$url/$id/related")->assertOk()
            ->assertJsonPath('data.0.kind', 'internal_rf')->assertJsonPath('data.0.id', $rf->id);

        $otherVariant = CatalogueVariant::findOrFail($rop['variant_id'])->replicate()->fill(['code' => 'SYN-SUPPLIES-B']);
        $otherVariant->save();
        $mixed = $this->write($actor, $url, array_replace($body, ['lines' => [$links[0], array_replace($rop, ['variant_id' => $otherVariant->id])]]))
            ->assertCreated()->json('data.resource_id');
        [$rfCall, $ropCall] = array_slice($shortage->calls, -2);
        $this->assertSame([$rop['variant_id']], $rfCall['variant_ids']);
        $this->assertFalse($rfCall['require_rop_and_target_policies']);
        $this->assertSame([$otherVariant->id], $ropCall['variant_ids']);
        $this->assertTrue($ropCall['require_rop_and_target_policies']);

        $excess = array_replace($links[0], [
            'requested_quantity' => '2.01',
            'additional_purchase_reason' => [
                'category' => 'disputed_supply', 'referenced_source_ids' => [], 'explanation' => 'The supplier disputes delivery.',
            ],
        ]);
        $override = $this->write($actor, $url, array_replace($body, ['lines' => [$excess, array_replace($rop, ['requested_quantity' => '5.00'])]]))
            ->assertCreated()->assertJsonPath('data.result.lines.0.net_need_breakdown.exceeds_uncovered_need', true)
            ->assertJsonPath('data.result.lines.1.net_need_breakdown.exceeds_uncovered_need', false)->json('data.resource_id');

        $reviewer = $this->officer($chapter, ['CHAPTER_HEAD'], '100.00');
        $this->series($chapter, $reviewer);
        $this->write($actor, "$url/$override/submit", $this->version(1, 1))->assertOk();
        $this->write($reviewer, "$url/$override/budget-review", $this->version(2, 1) + ['decision' => 'approve', 'reason' => null])
            ->assertOk()->assertJsonPath('data.result.approved_budget_php', '70.10');
        $this->assertDatabaseHas('internal_rfs', ['id' => $rf->id, 'status' => 'approved', 'fulfillment_status' => 'outstanding']);

        $this->write($actor, "$url/$mixed/submit", $this->version(1, 1))->assertOk();
        $this->write($reviewer, "$url/$mixed/budget-review", $this->version(2, 1) + ['decision' => 'reject', 'reason' => 'Budget reassigned'])
            ->assertOk()->assertJsonPath('data.result.status', 'rejected')->assertJsonPath('data.result.approved_budget_php', null);

        $rf->update(['status' => 'canceled', 'closed_at' => now()]);
        $this->write($actor, "$url/$id/submit", $this->version(1, 1))->assertConflict()->assertJsonPath('error.code', 'source_not_eligible');
        $foreign = $this->officer(Chapter::create(['code' => 'SYN-FOREIGN', 'name' => 'Another chapter']), ['INVENTORY']);
        $this->asBrowserOfficer($foreign->id)->get("$url/$id")->assertNotFound();
    }

    private function scenario(array $duties = ['INVENTORY']): array
    {
        $chapter = Chapter::create(['id' => (string) Str::uuid(), 'code' => 'SYN-REPF', 'name' => 'Replenishment chapter']);
        $officer = $this->officer($chapter, $duties, '100.00');
        $unit = CatalogueUnit::create([
            'chapter_id' => $chapter->id, 'code' => 'KG', 'name' => 'Kilogram', 'quantity_kind' => 'measured', 'quantity_scale' => 2,
        ]);
        $item = CatalogueItem::create(['chapter_id' => $chapter->id, 'code' => 'SYN-SUPPLIES', 'name' => 'Supplies', 'unit_id' => $unit->id]);
        $variant = CatalogueVariant::create([
            'chapter_id' => $chapter->id, 'item_id' => $item->id, 'code' => 'SYN-SUPPLIES-A',
            'name' => 'Supplies A', 'quantity_scale' => 2, 'unit_id' => $unit->id,
        ]);
        $shortage = new RepfShortageSnapshot;
        $this->app->instance(NetShortageSnapshotParticipant::class, $shortage);

        return [$chapter, $officer, "/api/v1/chapters/{$chapter->id}/repfs", [
            'funding_source' => 'chapter_funds', 'urgency' => 'normal', 'justification' => 'Stock for chapter use',
            'lines' => [[
                'trigger_kind' => 'rop_replenishment', 'variant_id' => $variant->id, 'unit_id' => $unit->id,
                'rf_id' => null, 'rf_line_id' => null, 'requested_quantity' => '1.00',
                'estimated_unit_cost_php' => '10.00', 'needed_by' => '2027-01-01T09:08:07.654321Z',
                'additional_purchase_reason' => null, 'notes' => null,
            ]],
        ], $shortage];
    }

    private function series(Chapter $chapter, User $approver): PolicyRecord
    {
        $id = (string) Str::uuid();
        $rules = ['document_kind' => 'REPF', 'prefix' => 'REPF', 'sequence_width' => 6, 'year_basis' => 'Asia/Manila'];
        $policy = PolicyRecord::create([
            'id' => $id, 'aggregate_id' => $id, 'chapter_id' => $chapter->id, 'policy_code' => 'reference_series',
            'policy_version' => 1, 'rules_json' => $rules, 'effective_from' => now()->subDay(),
        ]);
        AuditLog::create([
            'chapter_id' => $chapter->id, 'user_id' => $approver->id, 'action' => 'controlled:recordPolicy',
            'entity_type' => 'policy', 'entity_id' => $id,
            'details' => [
                'version' => 1, 'subject_id' => null, 'value_schema_reference' => '#/components/schemas/RepfReferenceSeriesPolicyValue',
                'value_sha256' => CanonicalJson::sha256($rules), 'approvals' => [['authority' => 'CHAPTER_HEAD', 'approver_id' => $approver->id]],
            ],
        ]);

        return $policy;
    }

    private function write(User $actor, string $url, array $body, ?string $key = null): TestResponse
    {
        return $this->asBrowserOfficer($actor->id, $key ?? (string) Str::uuid())->postJson($url, $body);
    }

    private function version(int $version, int $material): array
    {
        return ['expected_version' => $version, 'expected_material_version' => $material];
    }

    private function officer(Chapter $chapter, array $duties, ?string $limit = null): User
    {
        $user = User::create([
            'name' => 'Procurement officer', 'public_id' => (string) Str::uuid(),
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
