<?php

namespace Tests\Feature\Stage1A;

use App\Models\ActionReceipt;
use App\Models\AuditLog;
use App\Models\BrowserSession;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\ChapterOpeningGuard;
use App\Models\DomainNotificationOutbox;
use App\Models\DutyGrant;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\InventoryPosting;
use App\Models\OpeningCount;
use App\Models\OpeningFinding;
use App\Models\OpeningRm;
use App\Models\PolicyRecord;
use App\Models\ReferenceSequence;
use App\Models\User;
use App\Services\Inventory\StockViewQueryService;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\CanonicalJson;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class OpeningBaselinePostAndRecoveryTest extends TestCase
{
    use RefreshDatabase;

    private string $origin = 'https://opening.example.invalid';

    private string $chapterId;

    private string $custodianId;

    private string $receiverId;

    private string $receiverNoHistoryId;

    private string $headId;

    private string $financeId;

    private string $unitId;

    private string $itemId;

    private string $variantId;

    private string $locationId;

    private string $cutoffAt = '2026-11-01T00:00:00.000000Z';

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('evidence');

        $this->chapterId = (string) Str::uuid();
        $this->custodianId = (string) Str::uuid();
        $this->receiverId = (string) Str::uuid();
        $this->receiverNoHistoryId = (string) Str::uuid();
        $this->headId = (string) Str::uuid();
        $this->financeId = (string) Str::uuid();

        Chapter::create(['id' => $this->chapterId, 'code' => 'SYN-CEB', 'name' => 'Cebu Chapter', 'status' => 'live', 'version' => 1]);

        foreach ([
            [$this->custodianId, 'custodian@example.invalid', 'Custodian A', ['INVENTORY']],
            [$this->receiverId, 'receiver@example.invalid', 'Receiver B', ['INDEPENDENT_REVIEWER', 'RECEIVING']],
            [$this->receiverNoHistoryId, 'receiver-readonly@example.invalid', 'Receiver Limited', ['CHAPTER_HEAD']],
            [$this->headId, 'head@example.invalid', 'Chapter Head', ['CHAPTER_HEAD']],
            [$this->financeId, 'finance@example.invalid', 'Finance Officer', ['FINANCE']],
        ] as [$uid, $email, $name, $duties]) {
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
                DutyGrant::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $this->chapterId,
                    'user_id' => $uid,
                    'duty_code' => $duty,
                    'status' => 'active',
                    'is_alternate' => false,
                    'valid_from' => now()->subDay(),
                    'version' => 1,
                ]);
            }
        }

        $this->unitId = (string) Str::uuid();
        CatalogueUnit::create([
            'id' => $this->unitId, 'chapter_id' => $this->chapterId, 'code' => 'PCS', 'name' => 'Pieces',
            'quantity_kind' => 'piece', 'quantity_scale' => 0, 'state' => 'active', 'material_version' => 1,
        ]);

        $this->itemId = (string) Str::uuid();
        CatalogueItem::create([
            'id' => $this->itemId, 'chapter_id' => $this->chapterId, 'code' => 'SHIRT', 'name' => 'Shirt',
            'unit_id' => $this->unitId, 'state' => 'active', 'material_version' => 1,
        ]);

        $this->variantId = (string) Str::uuid();
        CatalogueVariant::create([
            'id' => $this->variantId, 'chapter_id' => $this->chapterId, 'item_id' => $this->itemId,
            'sku' => 'SHIRT-M', 'name' => 'Example shirt / M', 'unit_id' => $this->unitId,
            'quantity_scale' => 0, 'state' => 'active', 'material_version' => 1,
        ]);

        $this->locationId = (string) Str::uuid();
        CatalogueLocation::create([
            'id' => $this->locationId, 'chapter_id' => $this->chapterId, 'code' => 'MAIN', 'name' => 'Main Stockroom',
            'kind' => 'stockroom', 'custodian_id' => $this->custodianId, 'state' => 'active', 'material_version' => 1,
        ]);
    }

    public function test_chapter_guard_exists_before_drafts_and_post_reconciles_all_reads_replay_and_recovery(): void
    {
        // Pre-existing chapter guard exists before any baseline draft creation.
        $guard = ChapterOpeningGuard::find($this->chapterId);
        $this->assertNotNull($guard);
        $this->assertSame(1, $guard->stock_version);
        $this->assertNull($guard->posted_rm_id);

        // Before posting: baseline is null.
        $this->asOfficer($this->receiverId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-baseline")
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store')
            ->assertExactJson(['data' => null]);

        $policies = $this->seedEffectivePolicies();
        $lineUsable = (string) Str::uuid();
        $lineDamaged = (string) Str::uuid();
        $lineRejected = (string) Str::uuid();

        // Candidate 1 (12 usable + 2 damaged + 1 rejected = 15 @ PHP 25.00 -> PHP 300.00 accepted)
        $c1 = $this->prepareMatchedCandidate($policies, [
            $this->makeIpcLine($lineUsable, 'usable', '12'),
            $this->makeIpcLine($lineDamaged, 'damaged', '2'),
            $this->makeIpcLine($lineRejected, 'rejected', '1'),
        ], [
            ['ipc_line_id' => $lineUsable, 'accepted_quantity' => '12', 'damaged_quantity' => '0', 'rejected_quantity' => '0', 'accepted_value' => '300.00', 'finding_reason' => null],
            ['ipc_line_id' => $lineDamaged, 'accepted_quantity' => '0', 'damaged_quantity' => '2', 'rejected_quantity' => '0', 'accepted_value' => '0.00', 'finding_reason' => 'Damaged at cutoff'],
            ['ipc_line_id' => $lineRejected, 'accepted_quantity' => '0', 'damaged_quantity' => '0', 'rejected_quantity' => '1', 'accepted_value' => '0.00', 'finding_reason' => 'Rejected at cutoff'],
        ]);

        // Candidate 2 coexists as a second valid matched draft before posting.
        $lineOther = (string) Str::uuid();
        $c2 = $this->prepareMatchedCandidate($policies, [
            $this->makeIpcLine($lineOther, 'usable', '5'),
        ], [
            ['ipc_line_id' => $lineOther, 'accepted_quantity' => '5', 'damaged_quantity' => '0', 'rejected_quantity' => '0', 'accepted_value' => '125.00', 'finding_reason' => null],
        ]);

        // Before post: movements & findings return empty paginated lists.
        $this->asOfficer($this->receiverId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$c1['rm_id']}/movements")
            ->assertOk()
            ->assertJsonPath('data', [])
            ->assertJsonPath('page.next_cursor', null);
        $this->asOfficer($this->receiverId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$c1['rm_id']}/findings")
            ->assertOk()
            ->assertJsonPath('data', [])
            ->assertJsonPath('page.next_cursor', null);

        // Unauthorized caller without stock.read + history.read is denied.
        $this->asOfficer($this->receiverNoHistoryId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$c1['rm_id']}/movements")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'duty_denied');

        // Rejected attempt (stale expected_revision) consumes NO key and NO reference.
        $postKey = (string) Str::uuid();
        $this->asOfficer($this->receiverId, $postKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$c1['rm_id']}/post", [
                'expected_revision' => 1,
                'material_version' => 2,
                'ipc_material_version' => 2,
                'acknowledgment_id' => $c1['acknowledgment_id'],
            ])
            ->assertConflict()
            ->assertJsonPath('error.code', 'version_conflict');

        $this->assertSame(0, ReferenceSequence::where('chapter_id', $this->chapterId)->where('document_kind', 'RM')->count());

        // Lookup before commit returns 404 operation_not_found.
        $this->asOfficer($this->receiverId, $postKey)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-actions/by-key?operation=postOpeningRm")
            ->assertNotFound()
            ->assertJsonPath('error.code', 'operation_not_found');

        // Post candidate 1 using the same key (previously rejected key was not consumed).
        $postBody = [
            'expected_revision' => $c1['rm_revision'],
            'material_version' => 2,
            'ipc_material_version' => 2,
            'acknowledgment_id' => $c1['acknowledgment_id'],
        ];
        $posted = $this->asOfficer($this->receiverId, $postKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$c1['rm_id']}/post", $postBody);

        $posted->assertOk()
            ->assertHeader('X-Action-Replayed', 'false')
            ->assertHeader('Cache-Control', 'no-store')
            ->assertJsonPath('data.operation.operation', 'postOpeningRm')
            ->assertJsonPath('data.operation.action_key', $postKey)
            ->assertJsonPath('data.operation.http_status', 200)
            ->assertJsonPath('data.record.state', 'posted')
            ->assertJsonPath('data.record.revision', $c1['rm_revision'] + 1)
            ->assertJsonPath('data.posting.stock_version', 2)
            ->assertJsonPath('data.posting.accepted_value', '300.00')
            ->assertJsonPath('data.posting.currency', 'PHP')
            ->assertJsonPath('data.posting.baseline_locked', true)
            ->assertJsonPath('data.posting.acknowledgment_id', $c1['acknowledgment_id'])
            ->assertJsonCount(1, 'data.posting.movements')
            ->assertJsonCount(2, 'data.posting.findings')
            ->assertJsonCount(3, 'data.posting.lots');

        $rmRef = $posted->json('data.record.reference');
        $operationId = $posted->json('data.operation.id');
        $outcomeId = $posted->json('data.posting.id');
        $movementId = $posted->json('data.posting.movements.0.id');
        $findingIds = collect($posted->json('data.posting.findings'))->pluck('id')->all();

        $this->assertStringStartsWith('CEB-RM-', (string) $rmRef);
        $this->assertSame($outcomeId, $posted->json('data.record.outcome_id'));
        $this->assertTrue((bool) CatalogueUnit::findOrFail($this->unitId)->quantity_identity_locked);

        // IPC transitioned to posted with posted_rm_id.
        $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/ipcs/{$c1['ipc_id']}")
            ->assertOk()
            ->assertJsonPath('data.state', 'posted')
            ->assertJsonPath('data.posted_rm_id', $c1['rm_id']);

        // Outbox recorded IPC, RM, baseline (null versions), and 3 stock lots.
        $baselineEvent = DomainNotificationOutbox::where('chapter_id', $this->chapterId)
            ->where('event_name', 'stage1.opening-baseline.changed.v1')
            ->first();
        $this->assertNotNull($baselineEvent);
        $this->assertSame($this->chapterId, $baselineEvent->resource_id);
        $this->assertNull($baselineEvent->resource_version);
        $this->assertNull($baselineEvent->material_version);
        $this->assertSame(3, DomainNotificationOutbox::where('chapter_id', $this->chapterId)
            ->where('event_name', 'stage1.stock-lot.changed.v1')->count());

        // Reconcile baseline, movements, findings, related, history, and 7 stock views.
        $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-baseline")
            ->assertOk()
            ->assertExactJson(['data' => $posted->json('data.posting')]);

        $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$c1['rm_id']}/movements")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0', $posted->json('data.posting.movements.0'));

        $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$c1['rm_id']}/findings")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data', $posted->json('data.posting.findings'));

        $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$c1['rm_id']}/related")
            ->assertOk()
            ->assertJsonPath('data.movement_ids', [$movementId])
            ->assertJsonPath('data.finding_ids', $findingIds)
            ->assertJsonPath('data.outcome_id', $outcomeId);

        $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-rms/{$c1['rm_id']}/history")
            ->assertOk()
            ->assertJsonFragment(['operation' => 'postOpeningRm', 'id' => $operationId]);

        $views = app(StockViewQueryService::class)->getSevenViews($this->chapterId, $this->variantId);
        $this->assertSame('12', $views['usable_stockroom_on_hand']['quantity']);
        $this->assertSame('12', $views['available_to_allocate']['quantity']);
        $this->assertSame('3', $views['quarantined_rejected']['quantity']);
        $this->assertSame(15.0, $views['total_physical_balance']);

        // Exact authorized replay AFTER chapter lock returns original receipt with X-Action-Replayed: true.
        $this->asOfficer($this->receiverId, $postKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$c1['rm_id']}/post", $postBody)
            ->assertOk()
            ->assertHeader('X-Action-Replayed', 'true')
            ->assertExactJson($posted->json());

        // Changed intent under the same accepted key conflicts (409 action_key_conflict).
        $this->asOfficer($this->receiverId, $postKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$c1['rm_id']}/post", [
                'material_version' => 3,
            ] + $postBody)
            ->assertConflict()
            ->assertJsonPath('error.code', 'action_key_conflict');

        // Competing candidate 2 with a fresh key fails with 409 baseline_already_posted.
        $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$c2['rm_id']}/post", [
                'expected_revision' => $c2['rm_revision'],
                'material_version' => 2,
                'ipc_material_version' => 2,
                'acknowledgment_id' => $c2['acknowledgment_id'],
            ])
            ->assertConflict()
            ->assertJsonPath('error.code', 'baseline_already_posted');

        // Same RM with a different key also fails with 409 baseline_already_posted.
        $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$c1['rm_id']}/post", $postBody)
            ->assertConflict()
            ->assertJsonPath('error.code', 'baseline_already_posted');

        // Still exactly 1 RM reference, 1 accepted movement, 2 findings, 3 lots.
        $this->assertSame(1, InventoryMovement::where('chapter_id', $this->chapterId)->count());
        $this->assertSame(2, OpeningFinding::where('chapter_id', $this->chapterId)->count());
        $this->assertSame(3, InventoryLot::where('chapter_id', $this->chapterId)->count());
        $this->assertSame(1, (int) ReferenceSequence::where('chapter_id', $this->chapterId)->where('document_kind', 'RM')->value('last_sequence'));

        // Uncertain response recovery via both lookup operations returns exact original result.
        $this->asOfficer($this->receiverId, $postKey)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-actions/by-key?operation=postOpeningRm")
            ->assertOk()
            ->assertExactJson($posted->json());

        $this->asOfficer($this->receiverId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-actions/{$operationId}")
            ->assertOk()
            ->assertExactJson($posted->json());

        // Foreign actor cannot read another officer's receipt (404 operation_not_found).
        $this->asOfficer($this->custodianId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-actions/{$operationId}")
            ->assertNotFound()
            ->assertJsonPath('error.code', 'operation_not_found');

        // Actor without originating duty receives 403 duty_denied on by-key lookup.
        $this->asOfficer($this->custodianId, $postKey)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-actions/by-key?operation=postOpeningRm")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'duty_denied');

        // Revoking receiver's RECEIVING duty blocks receipt recovery (403 duty_denied).
        DutyGrant::where('chapter_id', $this->chapterId)
            ->where('user_id', $this->receiverId)
            ->where('duty_code', 'RECEIVING')
            ->update(['status' => 'revoked']);
        $this->asOfficer($this->receiverId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-actions/{$operationId}")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'duty_denied');

        // Revoking chapter membership yields uniform 404 chapter_not_found.
        ChapterMembership::where('chapter_id', $this->chapterId)
            ->where('user_id', $this->receiverId)
            ->update(['membership_status' => 'revoked']);
        $this->asOfficer($this->receiverId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-actions/{$operationId}")
            ->assertNotFound()
            ->assertJsonPath('error.code', 'chapter_not_found');
    }

    public function test_post_rechecks_policy_limit_versions_acknowledgment_and_lookup_selectors(): void
    {
        $policies = $this->seedEffectivePolicies();
        $lineId = (string) Str::uuid();
        $candidate = $this->prepareMatchedCandidate($policies, [
            $this->makeIpcLine($lineId, 'usable', '10'),
        ], [
            ['ipc_line_id' => $lineId, 'accepted_quantity' => '10', 'damaged_quantity' => '0', 'rejected_quantity' => '0', 'accepted_value' => '250.00', 'finding_reason' => null],
        ]);

        $postPath = "/api/v1/chapters/{$this->chapterId}/opening-rms/{$candidate['rm_id']}/post";
        $validBody = [
            'expected_revision' => $candidate['rm_revision'],
            'material_version' => 2,
            'ipc_material_version' => 2,
            'acknowledgment_id' => $candidate['acknowledgment_id'],
        ];

        // 422 invalid_input for string material_version
        $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->postJson($postPath, ['material_version' => '2'] + $validBody)
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'invalid_input')
            ->assertJsonPath('error.fields.0.pointer', '/material_version');

        // 409 snapshot_stale for wrong ipc_material_version
        $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->postJson($postPath, ['ipc_material_version' => 1] + $validBody)
            ->assertConflict()
            ->assertJsonPath('error.code', 'snapshot_stale');

        // 409 evidence_mismatch for wrong acknowledgment_id
        $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->postJson($postPath, ['acknowledgment_id' => (string) Str::uuid()] + $validBody)
            ->assertConflict()
            ->assertJsonPath('error.code', 'evidence_mismatch');

        // 403 duty_denied when RECEIVING monetary limit_php is below accepted value (250.00)
        $grant = DutyGrant::where('chapter_id', $this->chapterId)
            ->where('user_id', $this->receiverId)
            ->where('duty_code', 'RECEIVING')
            ->firstOrFail();
        $grant->update(['scope' => ['unit_id' => null, 'limit_php' => '100.00']]);
        $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->postJson($postPath, $validBody)
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'duty_denied');
        $grant->update(['scope' => null]);

        // 428 setup_blocked when valuation_rounding policy expires before post
        $valPolicy = PolicyRecord::where('chapter_id', $this->chapterId)
            ->where('policy_code', 'valuation_rounding')
            ->firstOrFail();
        $valPolicy->update(['effective_until' => now('UTC')->subMinute()]);
        $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->postJson($postPath, $validBody)
            ->assertStatus(428)
            ->assertJsonPath('error.code', 'setup_blocked')
            ->assertJsonPath('error.blockers.0.setting_key', 'valuation_rounding');
        $valPolicy->update(['effective_until' => null]);

        // 400 invalid_selector on malformed by-key lookup (missing key or invalid operation)
        $this->asOfficer($this->receiverId)
            ->get("/api/v1/chapters/{$this->chapterId}/opening-actions/by-key?operation=postOpeningRm")
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'invalid_selector');
        $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->get("/api/v1/chapters/{$this->chapterId}/opening-actions/by-key?operation=notAnOp")
            ->assertStatus(400)
            ->assertJsonPath('error.code', 'invalid_selector');

        // Nothing committed across all rejections
        $this->assertSame(0, InventoryMovement::where('chapter_id', $this->chapterId)->count());
        $this->assertNull(ChapterOpeningGuard::findOrFail($this->chapterId)->posted_rm_id);
    }

    public function test_complete_zero_accepted_baseline_locks_once_with_no_accepted_movements(): void
    {
        $policies = $this->seedEffectivePolicies();
        $lineDamaged = (string) Str::uuid();
        $lineZero = (string) Str::uuid();

        $candidate = $this->prepareMatchedCandidate($policies, [
            $this->makeIpcLine($lineDamaged, 'damaged', '3'),
            $this->makeIpcLine($lineZero, 'usable', '0'),
        ], [
            ['ipc_line_id' => $lineDamaged, 'accepted_quantity' => '0', 'damaged_quantity' => '3', 'rejected_quantity' => '0', 'accepted_value' => '0.00', 'finding_reason' => 'All units damaged'],
            ['ipc_line_id' => $lineZero, 'accepted_quantity' => '0', 'damaged_quantity' => '0', 'rejected_quantity' => '0', 'accepted_value' => '0.00', 'finding_reason' => null],
        ]);

        $res = $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$candidate['rm_id']}/post", [
                'expected_revision' => $candidate['rm_revision'],
                'material_version' => 2,
                'ipc_material_version' => 2,
                'acknowledgment_id' => $candidate['acknowledgment_id'],
            ]);

        $res->assertOk()
            ->assertJsonPath('data.record.state', 'posted')
            ->assertJsonPath('data.posting.accepted_value', '0.00')
            ->assertJsonPath('data.posting.baseline_locked', true)
            ->assertJsonCount(0, 'data.posting.movements')
            ->assertJsonCount(1, 'data.posting.findings')
            ->assertJsonCount(1, 'data.posting.lots')
            ->assertJsonPath('data.posting.lots.0.condition', 'quarantined');

        $this->assertSame(0, InventoryMovement::where('chapter_id', $this->chapterId)->count());
        $this->assertSame(0, InventoryLot::where('chapter_id', $this->chapterId)->where('condition', 'USABLE')->count());
        $this->assertSame(1, OpeningFinding::where('chapter_id', $this->chapterId)->count());

        $views = app(StockViewQueryService::class)->getSevenViews($this->chapterId, $this->variantId);
        $this->assertSame('0', $views['usable_stockroom_on_hand']['quantity']);
        $this->assertSame('3', $views['quarantined_rejected']['quantity']);
    }

    public function test_failure_after_staging_rolls_back_stock_findings_reference_outcome_and_outbox(): void
    {
        $policies = $this->seedEffectivePolicies();
        $lineUsable = (string) Str::uuid();
        $lineDamaged = (string) Str::uuid();

        $candidate = $this->prepareMatchedCandidate($policies, [
            $this->makeIpcLine($lineUsable, 'usable', '10'),
            $this->makeIpcLine($lineDamaged, 'damaged', '2'),
        ], [
            ['ipc_line_id' => $lineUsable, 'accepted_quantity' => '10', 'damaged_quantity' => '0', 'rejected_quantity' => '0', 'accepted_value' => '250.00', 'finding_reason' => null],
            ['ipc_line_id' => $lineDamaged, 'accepted_quantity' => '0', 'damaged_quantity' => '2', 'rejected_quantity' => '0', 'accepted_value' => '0.00', 'finding_reason' => 'Damaged'],
        ]);

        $outboxCountBefore = DomainNotificationOutbox::where('chapter_id', $this->chapterId)->count();
        $auditCountBefore = AuditLog::where('chapter_id', $this->chapterId)->count();

        // Inject failure right after participant staging and RM/IPC saves (on baseline outbox write).
        $shouldFail = true;
        $realOutbox = app(DomainNotificationOutboxService::class);
        $faultyOutbox = Mockery::mock(DomainNotificationOutboxService::class);
        $faultyOutbox->shouldReceive('recordIntent')->andReturnUsing(function (...$args) use ($realOutbox, &$shouldFail) {
            if ($shouldFail && ($args[0] ?? null) === 'stage1.opening-baseline.changed.v1') {
                throw new RuntimeException('Simulated post-staging outbox failure');
            }

            return $realOutbox->recordIntent(...$args);
        });
        $this->app->instance(DomainNotificationOutboxService::class, $faultyOutbox);

        $failKey = (string) Str::uuid();
        $response = $this->asOfficer($this->receiverId, $failKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$candidate['rm_id']}/post", [
                'expected_revision' => $candidate['rm_revision'],
                'material_version' => 2,
                'ipc_material_version' => 2,
                'acknowledgment_id' => $candidate['acknowledgment_id'],
            ]);
        $this->assertGreaterThanOrEqual(500, $response->getStatusCode());

        // Everything staged inside the outer transaction rolled back completely.
        $this->assertSame(0, InventoryPosting::where('chapter_id', $this->chapterId)->count());
        $this->assertSame(0, InventoryLot::where('chapter_id', $this->chapterId)->count());
        $this->assertSame(0, InventoryMovement::where('chapter_id', $this->chapterId)->count());
        $this->assertSame(0, OpeningFinding::where('chapter_id', $this->chapterId)->count());
        $this->assertSame(0, ReferenceSequence::where('chapter_id', $this->chapterId)->where('document_kind', 'RM')->count());
        $this->assertSame(0, ActionReceipt::where('chapter_id', $this->chapterId)->where('operation', 'postOpeningRm')->where('key', $failKey)->count());
        $this->assertSame($outboxCountBefore, DomainNotificationOutbox::where('chapter_id', $this->chapterId)->count());
        $this->assertSame($auditCountBefore, AuditLog::where('chapter_id', $this->chapterId)->count());

        $rm = OpeningRm::findOrFail($candidate['rm_id']);
        $ipc = OpeningCount::findOrFail($candidate['ipc_id']);
        $guard = ChapterOpeningGuard::findOrFail($this->chapterId);
        $this->assertSame('EVIDENCE_MATCHED', $rm->status);
        $this->assertNull($rm->rm_number);
        $this->assertNull($rm->posted_chapter_id);
        $this->assertSame('authorized', $ipc->status);
        $this->assertNull($ipc->posted_rm_id);
        $this->assertNull($guard->posted_rm_id);
        $this->assertSame(1, $guard->stock_version);

        // After infrastructure recovers, retrying with the same key succeeds once.
        $shouldFail = false;
        $this->asOfficer($this->receiverId, $failKey)
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$candidate['rm_id']}/post", [
                'expected_revision' => $candidate['rm_revision'],
                'material_version' => 2,
                'ipc_material_version' => 2,
                'acknowledgment_id' => $candidate['acknowledgment_id'],
            ])
            ->assertOk()
            ->assertHeader('X-Action-Replayed', 'false')
            ->assertJsonPath('data.record.state', 'posted');
    }

    /** @return array{ipc_id: string, rm_id: string, rm_revision: int, acknowledgment_id: string} */
    private function prepareMatchedCandidate(array $policies, array $ipcLines, array $rmLines): array
    {
        $ipcId = $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs", [
                'material' => ['cutoff_at' => null, 'informal_movements_suspended' => false, 'count_team' => [], 'policies' => [], 'lines' => [], 'notes' => null],
            ])->assertCreated()->json('data.record.id');

        $rmId = $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms", [
                'ipc_id' => $ipcId,
                'material' => ['ipc_material_version' => 1, 'lines' => [], 'notes' => null],
            ])->assertCreated()->json('data.record.id');

        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}", [
                'expected_revision' => 1,
                'reason' => 'Populate IPC lines',
                'material' => [
                    'cutoff_at' => $this->cutoffAt,
                    'informal_movements_suspended' => true,
                    'count_team' => [
                        ['user_id' => $this->custodianId, 'regular_custodian' => true],
                        ['user_id' => $this->receiverId, 'regular_custodian' => false],
                    ],
                    'policies' => $policies,
                    'lines' => $ipcLines,
                    'notes' => 'Frozen physical count',
                ],
            ])->assertOk();

        $countedAt = now('UTC')->subMinutes(4)->format('Y-m-d\TH:i:s.u\Z');
        $entries = array_map(fn (array $l) => [
            'ipc_line_id' => $l['line_id'],
            'quantity' => $l['counted_quantity'],
            'condition' => $l['condition'],
            'notes' => null,
        ], $ipcLines);

        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 2, 'material_version' => 2,
                'counted_at' => $countedAt, 'completed' => true, 'signed_at' => $countedAt, 'entries' => $entries,
            ])->assertOk();
        $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 3, 'material_version' => 2,
                'counted_at' => $countedAt, 'completed' => true, 'signed_at' => $countedAt, 'entries' => $entries,
            ])->assertOk();

        $signedIpc = $this->uploadPaper($this->receiverId, 'opening_receipt', $rmId, (string) Str::uuid())->assertCreated()->json('data');
        $signedIpcBytes = $this->byteBinding($signedIpc);

        $this->asOfficer($this->custodianId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/submit", [
                'expected_revision' => 4, 'material_version' => 2, 'signed_ipc' => $signedIpcBytes,
            ])->assertOk();

        $authSignedAt = now('UTC')->subMinutes(3)->format('Y-m-d\TH:i:s.u\Z');
        $this->asOfficer($this->headId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => 5, 'material_version' => 2, 'duty' => 'CHAPTER_HEAD', 'signed_at' => $authSignedAt,
            ])->assertOk();
        $this->asOfficer($this->financeId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/ipcs/{$ipcId}/authorizations", [
                'expected_revision' => 6, 'material_version' => 2, 'duty' => 'FINANCE', 'signed_at' => $authSignedAt,
            ])->assertOk();

        $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}", [
                'expected_revision' => 1, 'reason' => 'Populate RM lines',
                'material' => ['ipc_material_version' => 2, 'lines' => $rmLines, 'notes' => null],
            ])->assertOk();

        $inspected = $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/inspection", [
                'expected_revision' => 2,
                'ipc_material_version' => 2,
                'inspected_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'technical_representative_id' => null,
                'inspection_notes' => 'All lines inspected.',
            ])->assertOk();

        $receiptPaper = $this->uploadPaper($this->receiverId, 'opening_receipt', $rmId, (string) Str::uuid())->assertCreated()->json('data');
        $matched = $this->asOfficer($this->receiverId, (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$this->chapterId}/opening-rms/{$rmId}/evidence-match", [
                'expected_revision' => 3,
                'material_version' => 2,
                'snapshot_sha256' => $inspected->json('data.record.snapshot_sha256'),
                'bytes' => $this->byteBinding($receiptPaper),
                'acknowledged_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
            ])->assertOk();

        return [
            'ipc_id' => $ipcId,
            'rm_id' => $rmId,
            'rm_revision' => (int) $matched->json('data.record.revision'),
            'acknowledgment_id' => (string) $matched->json('data.record.acknowledgment.acknowledgment_id'),
        ];
    }

    /** @return list<array<string, mixed>> */
    private function seedEffectivePolicies(): array
    {
        $defs = [
            'ipc_authorization' => ['CHAPTER_HEAD', $this->headId, 'IpcAuthorizationPolicyValue', [
                'cutoff_at' => $this->cutoffAt,
                'count_team_ids' => [$this->custodianId, $this->receiverId],
                'suspension_record_reference' => 'SUSP-2026-01',
            ]],
            'reference_series' => ['CHAPTER_HEAD', $this->headId, 'OpeningReferencePolicyValue', [
                'ipc_prefix' => 'CEB-IPC',
                'rm_prefix' => 'CEB-RM',
                'minimum_digits' => 6,
            ]],
            'valuation_rounding' => ['FINANCE', $this->financeId, 'OpeningValuationPolicyValue', [
                'currency' => 'PHP',
                'unit_value_scale' => 2,
                'rounding_mode' => 'half_up',
                'round_at' => 'accepted_line',
                'valuation_basis_reference' => 'VAL-2026-01',
            ]],
        ];

        $bindings = [];
        foreach ($defs as $key => [$owner, $approverId, $schema, $value]) {
            $id = (string) Str::uuid();
            PolicyRecord::create([
                'id' => $id,
                'aggregate_id' => $id,
                'chapter_id' => $this->chapterId,
                'policy_code' => $key,
                'policy_version' => 1,
                'rules_json' => $value,
                'effective_from' => now('UTC')->subHour(),
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
            $bindings[] = ['setting_key' => $key, 'policy_id' => $id, 'version' => 1];
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
            'historical_variant_label' => 'Example shirt / M',
            'location_id' => $this->locationId,
            'location_material_version' => 1,
            'regular_custodian_ids' => [$this->custodianId],
            'condition' => $condition,
            'counted_quantity' => $qty,
            'unit_value' => '25.00',
            'valuation_basis' => 'Documented cost basis',
            'provenance_reference' => 'Sheet O-1',
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
        $boundary = 'ysp-ticket10-boundary';
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
