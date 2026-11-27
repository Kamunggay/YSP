<?php

namespace Tests\Feature\Stage2;

use App\Exceptions\ContractException;
use App\Models\Chapter;
use App\Models\DomainNotificationOutbox;
use App\Models\Stage2RecordHistory;
use App\Models\User;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Inventory\Participants\LotRestrictionResolutionParticipant;
use App\Services\Inventory\Participants\NetShortageSnapshotParticipant;
use App\Services\Inventory\Participants\ReceivingInventoryParticipant;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Notifications\NotificationSubjectRead;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use InvalidArgumentException;
use LogicException;
use Tests\Feature\Concerns\AuthenticatesBrowserOfficer;
use Tests\TestCase;

class FoundationsTest extends TestCase
{
    use AuthenticatesBrowserOfficer, RefreshDatabase;

    public function test_stage2_schema_preserves_stage1_inventory_identity(): void
    {
        foreach ([
            'chapter_variant_procurement_guards', 'chapter_events', 'repfs', 'repf_lines', 'repf_quotations',
            'purchase_orders', 'purchase_order_lines', 'purchase_order_amendments', 'donations', 'donation_lines',
            'donation_restriction_resolutions', 'receiving_reports', 'receiving_report_lines',
            'receiving_discrepancies', 'receiving_holds', 'stage2_record_histories',
        ] as $table) {
            $this->assertTrue(Schema::hasTable($table), $table);
        }
        $this->assertTrue(Schema::hasColumns('chapter_organizational_units', ['code', 'name']));
        $this->assertTrue(Schema::hasIndex('purchase_order_amendments', 'po_amendment_one_pending', 'unique'));
        $this->assertTrue(Schema::hasIndex('stage2_record_histories', ['chapter_id', 'record_kind', 'record_id', 'sequence_no'], 'unique'));
        $this->assertTrue(Schema::hasIndex('inventory_movements', 'inv_mov_opening_line_unique', 'unique'));
        $this->assertTrue(Schema::hasIndex('inventory_movements', ['chapter_id', 'source_rm_id', 'rm_line_id', 'movement_kind'], 'unique'));
        $this->assertTrue(Schema::hasIndex('inventory_lots', ['chapter_id', 'source_kind', 'origin_source_id', 'origin_source_line_id']));
    }

    public function test_stage2_history_records_keep_the_original_snapshot(): void
    {
        $chapter = Chapter::create(['code' => 'SYN-HISTORY', 'name' => 'Synthetic chapter']);
        $entry = Stage2RecordHistory::create([
            'chapter_id' => $chapter->id, 'record_kind' => 'repf', 'record_id' => (string) Str::uuid(),
            'sequence_no' => 1, 'version' => 1, 'material_version' => 1, 'is_version_snapshot' => true,
            'event_type' => 'createRepf', 'actor_user_id' => (string) Str::uuid(),
            'snapshot_json' => ['status' => 'draft'], 'recorded_at' => now(),
        ]);

        foreach ([
            fn () => $entry->update(['reason' => 'Overwrite']),
            $entry->delete(...),
            fn () => Stage2RecordHistory::whereKey($entry->id)->update(['reason' => 'Bulk overwrite']),
            fn () => Stage2RecordHistory::whereKey($entry->id)->delete(),
            fn () => Stage2RecordHistory::whereKey($entry->id)->forceDelete(),
            fn () => $entry->increment('version'),
            fn () => Stage2RecordHistory::whereKey($entry->id)->updateOrInsert(['id' => $entry->id], ['reason' => 'Rewrite']),
        ] as $rewrite) {
            try {
                $rewrite();
                $this->fail('The existing history row was mutable.');
            } catch (LogicException $exception) {
                $this->assertSame('Stage 2 record history is append-only.', $exception->getMessage());
            }
        }

        $this->assertSame(['status' => 'draft'], $entry->fresh()->snapshot_json);
    }

    public function test_stage2_paper_uploads_read_and_match_only_the_exact_eligible_target(): void
    {
        Storage::fake('evidence');
        $chapter = Chapter::create(['code' => 'SYN-PAPER', 'name' => 'Synthetic chapter']);
        $author = $this->officer($chapter, ['INVENTORY', 'PURCHASING', 'RECEIVING']);
        $other = $this->officer($chapter, ['RECEIVING']);
        $repf = (string) Str::uuid();
        $po = (string) Str::uuid();
        $pendingDa = (string) Str::uuid();
        $receivedDa = (string) Str::uuid();
        $poRm = (string) Str::uuid();
        $daRm = (string) Str::uuid();
        $rmLine = (string) Str::uuid();
        $discrepancy = (string) Str::uuid();
        $hold = (string) Str::uuid();
        $scope = ['chapter_id' => $chapter->id];
        $line = ['variant_id' => (string) Str::uuid(), 'unit_id' => (string) Str::uuid(), 'quantity_scale' => 0];
        $actor = ['prepared_by' => $author->id];
        $location = (string) Str::uuid();

        DB::table('repfs')->insert($scope + $actor + ['id' => $repf, 'status' => 'approved']);
        DB::table('purchase_orders')->insert($scope + $actor + [
            'id' => $po, 'status' => 'issued', 'repf_id' => $repf, 'supplier_selection_id' => (string) Str::uuid(),
            'supplier' => '{}', 'delivery_location' => 'Synthetic receiving address', 'expected_delivery_date' => now()->toDateString(),
            'payment_and_delivery_terms' => 'Synthetic terms', 'total_amount_php' => '1.00',
        ]);
        $donor = $scope + $actor + [
            'donor_name' => 'Synthetic donor', 'valuation_policy_id' => (string) Str::uuid(),
            'valuation_policy_version' => 1, 'valuation_policy' => '{}', 'pledged_total_value_php' => '1.00',
        ];
        DB::table('donations')->insert([
            $donor + ['id' => $pendingDa, 'status' => 'pending_acknowledgment'],
            $donor + ['id' => $receivedDa, 'status' => 'received'],
        ]);
        $receiving = $scope + $actor + ['status' => 'inspected', 'source_material_version' => 1, 'location_id' => $location];
        DB::table('receiving_reports')->insert([
            $receiving + ['id' => $poRm, 'source_kind' => 'po', 'source_id' => $po, 'source_reference' => 'PO-SYN'],
            $receiving + ['id' => $daRm, 'source_kind' => 'da', 'source_id' => $receivedDa, 'source_reference' => 'DA-SYN'],
        ]);
        $sourceLine = (string) Str::uuid();
        DB::table('receiving_report_lines')->insert($line + [
            'id' => $rmLine, 'rm_id' => $poRm, 'line_number' => 1, 'source_line_id' => $sourceLine, 'delivered_quantity' => '1',
        ]);
        DB::table('receiving_discrepancies')->insert($scope + $line + [
            'id' => $discrepancy, 'source_kind' => 'po', 'source_id' => $po, 'source_line_id' => $sourceLine,
            'rm_id' => $poRm, 'rm_line_id' => $rmLine, 'damaged_quantity' => '1', 'rejected_quantity' => '0',
            'discrepancy_notes' => 'Synthetic discrepancy',
        ]);
        DB::table('receiving_holds')->insert($scope + [
            'id' => $hold, 'arrived_at' => now(), 'holding_location_id' => $location, 'carrier_or_sender_name' => 'Carrier',
            'sender_kind' => 'carrier', 'hold_reason' => 'Missing source', 'items' => '[]', 'recorded_by' => $author->id,
        ]);

        $uri = "/api/v1/chapters/{$chapter->id}/evidence";
        $pdf = $this->validPaperPdf();
        $upload = fn (string $purpose, string $id) => $this->sendRawMultipartPaper(
            $uri, $author->id, (string) Str::uuid(), ['purpose' => $purpose, 'record_id' => $id],
            [['filename' => 'signed.pdf', 'media_type' => 'application/pdf', 'bytes' => $pdf]],
        );
        $evidence = [];
        foreach ([
            ['quotation_attachment', $repf], ['quotation_attachment', $po], ['po_supplier_dr', $poRm],
            ['da_acknowledgment', $pendingDa], ['da_receipt', $daRm], ['donor_restriction_resolution', $receivedDa],
            ['receiving_discrepancy', $discrepancy], ['missing_source_hold', $hold],
        ] as [$purpose, $id]) {
            $uploaded = $upload($purpose, $id)->assertCreated()->assertHeader('X-Action-Replayed', 'false')
                ->assertJsonPath('data.target', ['purpose' => $purpose, 'record_id' => $id])->json('data');
            $evidence[$id] = $uploaded;
            $this->asBrowserOfficer($author->id)->get("{$uri}/{$uploaded['evidence_id']}")
                ->assertOk()->assertJsonPath('data.target.record_id', $id);
        }

        $upload('po_supplier_dr', $daRm)->assertNotFound()->assertJsonPath('error.code', 'evidence_not_found');
        $upload('da_receipt', (string) Str::uuid())->assertNotFound()->assertJsonPath('error.code', 'evidence_not_found');
        $this->asBrowserOfficer($other->id)->get("{$uri}/{$evidence[$repf]['evidence_id']}")
            ->assertNotFound()->assertJsonPath('error.code', 'evidence_not_found');

        $paper = $evidence[$poRm];
        $snapshot = ['target' => $paper['target'], 'material_version' => 1, 'sha256' => hash('sha256', 'frozen material')];
        $binding = [
            'evidence_id' => $paper['evidence_id'], 'version_id' => $paper['version_id'],
            'attachments' => [['attachment_id' => $paper['attachments'][0]['attachment_id'], 'sha256' => hash('sha256', $pdf)]],
        ];
        $input = [
            'chapter_id' => $chapter->id, 'actor_id' => $author->id, 'snapshot' => $snapshot, 'required_bytes' => $binding,
            'acknowledgment' => [
                'acknowledgment_id' => (string) Str::uuid(), 'matched_by' => $author->id,
                'matched_at' => now()->toISOString(), 'recipient_id' => null, 'acknowledged_at' => now()->toISOString(),
                'snapshot' => $snapshot, 'bytes' => $binding,
            ],
        ];
        $matcher = app(CheckEvidenceBindingParticipant::class);
        $this->assertSame('ready', $matcher->check($input)['outcome']);
        $input['acknowledgment']['snapshot']['sha256'] = hash('sha256', 'different inspected material');
        $this->assertSame(['outcome' => 'mismatched', 'reason' => 'snapshot_changed'], $matcher->check($input));
        $input['snapshot']['target']['record_id'] = $daRm;
        $this->assertSame(['outcome' => 'mismatched', 'reason' => 'target_mismatch'], $matcher->check($input));

        DB::table('donations')->where('id', $pendingDa)->update(['status' => 'acknowledged']);
        $upload('da_acknowledgment', $pendingDa)->assertConflict()->assertJsonPath('error.code', 'target_locked');
    }

    public function test_stage2_outbox_uses_closed_envelopes_and_current_subject_read_routes(): void
    {
        $chapter = Chapter::create(['id' => (string) Str::uuid(), 'code' => 'SYN-EVENTS', 'name' => 'Synthetic chapter']);
        $reader = $this->officer($chapter, ['INVENTORY']);
        $denied = $this->officer($chapter, ['SALES_OFFICER']);
        $outbox = app(DomainNotificationOutboxService::class);
        $subjectRead = app(NotificationSubjectRead::class);
        $id = (string) Str::uuid();

        foreach ([
            'repf' => ['repf', 'repfs', 'repf.read'],
            'purchase-order' => ['purchase_order', 'purchase-orders', 'po.read'],
            'donation' => ['donation', 'donations', 'da.read'],
            'receiving-report' => ['receiving_report', 'receiving-reports', 'receiving.read'],
            'receiving-discrepancy' => ['receiving_discrepancy', 'receiving-discrepancies', 'receiving.read'],
            'receiving-hold' => ['receiving_hold', 'receiving-holds', 'receiving.read'],
        ] as $name => [$kind, $path, $duty]) {
            $eventName = "stage2.{$name}.changed.v1";
            $event = $outbox->recordIntent($eventName, $chapter->id, $id, 2, 1)->fresh();
            $payload = $event->payload_json;
            $this->assertEqualsCanonicalizing([
                'event_name', 'event_id', 'committed_at', 'chapter_id', 'resource_kind', 'resource_id',
                'resource_version', 'material_version',
            ], array_keys($payload));
            $this->assertSame($kind, $payload['resource_kind']);
            $this->assertSame($id, $payload['resource_id']);
            $this->assertSame($chapter->id, $payload['chapter_id']);
            $this->assertSame($event->id, $payload['event_id']);
            $this->assertSame($eventName, $payload['event_name']);
            $this->assertSame(2, $payload['resource_version']);
            $this->assertSame(1, $payload['material_version']);
            $this->assertMatchesRegularExpression('/\.\d{6}Z$/', $payload['committed_at']);
            $this->assertSame("private-stage1.chapter.{$chapter->id}", $event->channel_name);

            $this->assertFalse($subjectRead->allows($reader, $event));
            if (in_array($kind, ['repf', 'purchase_order'], true)) {
                continue;
            }
            // Exercise the real middleware until the remaining detail controllers are available.
            Route::get("api/v1/chapters/{chapter_id}/{$path}/{subject_id}", fn (string $chapter_id, string $subject_id) => $chapter_id === $chapter->id && $subject_id === $id ? response()->noContent() : response('', 404))
                ->middleware('browser.authority', 'stage-one.chapter', "stage-one.action:{$duty}");
            $this->assertTrue($subjectRead->allows($reader, $event));
            $this->assertFalse($subjectRead->allows($denied, $event));
        }

        $reader->dutyGrants()->update(['status' => 'revoked']);
        $this->assertFalse($subjectRead->allows($reader, $event));
        DB::beginTransaction();
        $rolledBack = $outbox->recordIntent('stage2.repf.changed.v1', $chapter->id, $id, 2, 1);
        DB::rollBack();
        $this->assertModelMissing($rolledBack);

        foreach (['stage2.alert.changed.v1', 'stage2.repf.changed.v1'] as $invalid) {
            try {
                $outbox->recordIntent($invalid, $chapter->id, $id);
                $this->fail('An invalid notice was accepted.');
            } catch (InvalidArgumentException) {
                $this->assertSame(6, DomainNotificationOutbox::where('event_name', 'like', 'stage2.%')->count());
            }
        }
    }

    public function test_unwired_participants_fail_closed_without_public_routes(): void
    {
        foreach ([
            NetShortageSnapshotParticipant::class => 'computeNetShortageSnapshot',
            ReceivingInventoryParticipant::class => 'prepareReceivingInventory',
            LotRestrictionResolutionParticipant::class => 'applyLotRestrictionResolution',
        ] as $interface => $method) {
            try {
                app($interface)->{$method}([]);
                $this->fail("Unwired participant {$method} must abort the caller.");
            } catch (ContractException $exception) {
                $this->assertSame(503, $exception->statusCode);
                $this->assertSame('unavailable', $exception->errorCode);
            }
            $this->assertFalse(collect(Route::getRoutes())->contains(fn ($route) => $route->getActionMethod() === $method));
        }
        $this->assertFalse(collect(Route::getRoutes())->contains(fn ($route) => $route->getActionMethod() === 'checkEvidenceBinding'));
    }

    private function officer(Chapter $chapter, array $duties): User
    {
        $user = User::create([
            'name' => 'Synthetic officer', 'public_id' => (string) Str::uuid(),
            'email' => Str::uuid().'@example.invalid', 'password_hash' => Hash::make('Synthetic test credential'),
        ]);
        $user->memberships()->create(['chapter_id' => $chapter->id]);
        foreach ($duties as $duty) {
            $user->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => $duty]);
        }

        return $user;
    }
}
