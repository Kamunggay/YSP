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
use App\Models\DutyGrant;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\OpeningFinding;
use App\Models\OpeningRm;
use App\Models\PolicyRecord;
use App\Models\ReferenceSequence;
use App\Models\User;
use App\Services\Shared\CanonicalJson;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PDO;
use Tests\TestCase;

class OpeningBaselineMysqlConcurrencyTest extends TestCase
{
    private string $origin = 'https://opening.example.invalid';

    private string $cutoffAt = '2026-11-01T00:00:00.000000Z';

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::connection()->getDriverName() !== 'mysql') {
            $this->markTestSkipped('Requires real MySQL connection.');
        }

        config(['app.url' => $this->origin]);
        app('url')->useOrigin($this->origin);
        app('url')->forceScheme('https');
    }

    public function test_parallel_mysql_workers_enforce_one_baseline_and_unique_constraints(): void
    {
        $ctx = $this->seedChapterContext();
        $c1 = $this->prepareMatchedCandidate($ctx, '12', '2', '1', '300.00');
        $c2 = $this->prepareMatchedCandidate($ctx, '5', '0', '0', '125.00');

        $session1 = $this->sessionFor($ctx['receiver_id']);
        $session2 = $this->sessionFor($ctx['receiver_id']);

        $key1 = (string) Str::uuid();
        $key2 = (string) Str::uuid();

        [$r1, $r2, $waiters] = $this->runOverlappingWorkers($ctx['chapter_id'], [
            [
                'origin' => $this->origin,
                'path' => "/api/v1/chapters/{$ctx['chapter_id']}/opening-rms/{$c1['rm_id']}/post",
                'token' => $session1['token'],
                'csrf' => $session1['csrf'],
                'action_key' => $key1,
                'body' => [
                    'expected_revision' => $c1['rm_revision'],
                    'material_version' => 2,
                    'ipc_material_version' => 2,
                    'acknowledgment_id' => $c1['acknowledgment_id'],
                ],
            ],
            [
                'origin' => $this->origin,
                'path' => "/api/v1/chapters/{$ctx['chapter_id']}/opening-rms/{$c2['rm_id']}/post",
                'token' => $session2['token'],
                'csrf' => $session2['csrf'],
                'action_key' => $key2,
                'body' => [
                    'expected_revision' => $c2['rm_revision'],
                    'material_version' => 2,
                    'ipc_material_version' => 2,
                    'acknowledgment_id' => $c2['acknowledgment_id'],
                ],
            ],
        ]);

        $this->assertGreaterThanOrEqual(
            2,
            $waiters,
            'Both MySQL worker transactions must overlap on the chapter guard lock. Responses: '.json_encode([$r1, $r2])
        );

        $statuses = [$r1['status'], $r2['status']];
        sort($statuses);
        $this->assertSame([200, 409], $statuses);

        $winner = $r1['status'] === 200 ? $r1 : $r2;
        $loser = $r1['status'] === 409 ? $r1 : $r2;
        $this->assertSame('false', $winner['replayed']);
        $this->assertSame('baseline_already_posted', $loser['body']['error']['code'] ?? null);

        $postedRmId = $winner['body']['data']['record']['id'];
        $this->assertSame(1, OpeningRm::where('chapter_id', $ctx['chapter_id'])->where('status', 'posted')->count());
        $this->assertSame(1, (int) ReferenceSequence::where('chapter_id', $ctx['chapter_id'])->where('document_kind', 'RM')->value('last_sequence'));
        $this->assertSame(1, InventoryMovement::where('chapter_id', $ctx['chapter_id'])->count());
        $this->assertSame(1, ActionReceipt::where('chapter_id', $ctx['chapter_id'])->where('operation', 'postOpeningRm')->count());

        $guard = ChapterOpeningGuard::findOrFail($ctx['chapter_id']);
        $this->assertSame($postedRmId, $guard->posted_rm_id);
        $this->assertSame(2, $guard->stock_version);

        // Verify MySQL database unique constraints directly.
        $loserRmId = $postedRmId === $c1['rm_id'] ? $c2['rm_id'] : $c1['rm_id'];
        $this->expectUniqueViolation(fn () => DB::table('opening_rms')->where('id', $loserRmId)->update(['posted_chapter_id' => $ctx['chapter_id']]));

        $receipt = ActionReceipt::where('chapter_id', $ctx['chapter_id'])->where('operation', 'postOpeningRm')->firstOrFail();
        $this->expectUniqueViolation(fn () => ActionReceipt::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $receipt->chapter_id,
            'user_id' => $receipt->user_id,
            'operation' => $receipt->operation,
            'key' => $receipt->key,
            'fingerprint' => $receipt->fingerprint,
            'status' => 200,
            'result' => [],
        ]));

        $mov = InventoryMovement::where('chapter_id', $ctx['chapter_id'])->firstOrFail();
        $this->expectUniqueViolation(fn () => InventoryMovement::create([
            'id' => (string) Str::uuid(),
            'posting_id' => $mov->posting_id,
            'chapter_id' => $mov->chapter_id,
            'variant_id' => $mov->variant_id,
            'unit_id' => $mov->unit_id,
            'location_id' => $mov->location_id,
            'condition' => 'USABLE',
            'quantity' => '1.000000',
            'balance_after' => '1.000000',
            'created_at' => now('UTC'),
            'movement_kind' => $mov->movement_kind,
            'source_rm_id' => $mov->source_rm_id,
            'source_ipc_id' => $mov->source_ipc_id,
            'source_ipc_line_id' => $mov->source_ipc_line_id,
        ]));
    }

    public function test_parallel_mysql_same_key_replay_and_changed_intent_conflict(): void
    {
        // Case A: Exact identical retry concurrently across two separate MySQL workers.
        $ctxA = $this->seedChapterContext();
        $cA = $this->prepareMatchedCandidate($ctxA, '10', '1', '0', '250.00');
        $s1 = $this->sessionFor($ctxA['receiver_id']);
        $s2 = $this->sessionFor($ctxA['receiver_id']);
        $sameKey = (string) Str::uuid();
        $body = [
            'expected_revision' => $cA['rm_revision'],
            'material_version' => 2,
            'ipc_material_version' => 2,
            'acknowledgment_id' => $cA['acknowledgment_id'],
        ];

        [$r1, $r2, $waitersA] = $this->runOverlappingWorkers($ctxA['chapter_id'], [
            ['origin' => $this->origin, 'path' => "/api/v1/chapters/{$ctxA['chapter_id']}/opening-rms/{$cA['rm_id']}/post", 'token' => $s1['token'], 'csrf' => $s1['csrf'], 'action_key' => $sameKey, 'body' => $body],
            ['origin' => $this->origin, 'path' => "/api/v1/chapters/{$ctxA['chapter_id']}/opening-rms/{$cA['rm_id']}/post", 'token' => $s2['token'], 'csrf' => $s2['csrf'], 'action_key' => $sameKey, 'body' => $body],
        ]);

        $this->assertGreaterThanOrEqual(2, $waitersA);
        $this->assertSame(200, $r1['status']);
        $this->assertSame(200, $r2['status']);
        $replayedFlags = [$r1['replayed'], $r2['replayed']];
        sort($replayedFlags);
        $this->assertSame(['false', 'true'], $replayedFlags);
        $this->assertSame(CanonicalJson::encode($r1['body']), CanonicalJson::encode($r2['body']));
        $this->assertSame(1, InventoryMovement::where('chapter_id', $ctxA['chapter_id'])->count());
        $this->assertSame(1, OpeningFinding::where('chapter_id', $ctxA['chapter_id'])->count());
        $this->assertSame(2, InventoryLot::where('chapter_id', $ctxA['chapter_id'])->count());

        // Case B: Changed intent under same accepted key across two parallel workers.
        $ctxB = $this->seedChapterContext();
        $cB = $this->prepareMatchedCandidate($ctxB, '8', '0', '0', '200.00');
        $s3 = $this->sessionFor($ctxB['receiver_id']);
        $s4 = $this->sessionFor($ctxB['receiver_id']);
        $conflictKey = (string) Str::uuid();
        $validBody = [
            'expected_revision' => $cB['rm_revision'],
            'material_version' => 2,
            'ipc_material_version' => 2,
            'acknowledgment_id' => $cB['acknowledgment_id'],
        ];
        $mutatedBody = ['material_version' => 3] + $validBody;

        // First commit validBody, then send mutatedBody with same key (and also verify parallel overlap).
        [$m1, $m2, $waitersB] = $this->runOverlappingWorkers($ctxB['chapter_id'], [
            ['origin' => $this->origin, 'path' => "/api/v1/chapters/{$ctxB['chapter_id']}/opening-rms/{$cB['rm_id']}/post", 'token' => $s3['token'], 'csrf' => $s3['csrf'], 'action_key' => $conflictKey, 'body' => $validBody],
            ['origin' => $this->origin, 'path' => "/api/v1/chapters/{$ctxB['chapter_id']}/opening-rms/{$cB['rm_id']}/post", 'token' => $s4['token'], 'csrf' => $s4['csrf'], 'action_key' => $conflictKey, 'body' => $mutatedBody],
        ]);

        $this->assertGreaterThanOrEqual(2, $waitersB);
        $codes = [$m1['status'], $m2['status']];
        sort($codes);
        $this->assertSame([200, 409], $codes);
        $rejected = $m1['status'] === 409 ? $m1 : $m2;
        // Depending on which worker enters the guard first, mutated loses with either action_key_conflict (after valid commits) or version_conflict (if mutated runs first and rolls back without consuming the key).
        $this->assertContains($rejected['body']['error']['code'] ?? null, ['action_key_conflict', 'version_conflict']);

        // After commit, repeating mutatedBody with the accepted key ALWAYS yields 409 action_key_conflict.
        $this->asOfficer($ctxB['receiver_id'], $conflictKey)
            ->postJson("/api/v1/chapters/{$ctxB['chapter_id']}/opening-rms/{$cB['rm_id']}/post", $mutatedBody)
            ->assertConflict()
            ->assertJsonPath('error.code', 'action_key_conflict');
    }

    /**
     * Hold an exclusive MySQL lock on chapter_opening_guards, spawn two independent PHP worker processes,
     * wait until both MySQL transactions are in LOCK WAIT state, then release the lock so both race.
     *
     * @param  array<int, array<string, mixed>>  $jobs
     * @return array{array<string, mixed>, array<string, mixed>, int}
     */
    private function runOverlappingWorkers(string $chapterId, array $jobs): array
    {
        $cfg = config('database.connections.mysql');
        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $cfg['host'], $cfg['port'], $cfg['database']);
        $holder = new PDO($dsn, $cfg['username'], $cfg['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $observer = new PDO($dsn, $cfg['username'], $cfg['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

        $holder->beginTransaction();
        $stmt = $holder->prepare('SELECT chapter_id FROM chapter_opening_guards WHERE chapter_id = ? FOR UPDATE');
        $stmt->execute([$chapterId]);
        $this->assertNotFalse($stmt->fetch());

        $workerScript = base_path('tests/Fixtures/opening-post-worker.php');
        $procs = [];
        $pipesList = [];
        foreach ($jobs as $i => $job) {
            $proc = proc_open(['php', $workerScript], [
                0 => ['pipe', 'r'],
                1 => ['pipe', 'w'],
                2 => ['pipe', 'w'],
            ], $pipes);
            $this->assertIsResource($proc);
            fwrite($pipes[0], json_encode($job, JSON_THROW_ON_ERROR));
            fclose($pipes[0]);
            $procs[$i] = $proc;
            $pipesList[$i] = $pipes;
        }

        // Poll MySQL InnoDB lock waits until both worker transactions are genuinely blocked on the guard row lock.
        $observedWaiters = 0;
        $deadline = microtime(true) + 15.0;
        while (microtime(true) < $deadline) {
            $trxWaiters = (int) $observer->query("SELECT COUNT(*) FROM information_schema.innodb_trx WHERE trx_state = 'LOCK WAIT'")->fetchColumn();
            $psWaiters = (int) $observer->query('SELECT COUNT(DISTINCT REQUESTING_ENGINE_TRANSACTION_ID) FROM performance_schema.data_lock_waits')->fetchColumn();
            $count = max($trxWaiters, $psWaiters);
            if ($count > $observedWaiters) {
                $observedWaiters = $count;
            }
            if ($observedWaiters >= 2) {
                break;
            }
            $allDone = true;
            foreach ($procs as $proc) {
                if (proc_get_status($proc)['running']) {
                    $allDone = false;
                    break;
                }
            }
            if ($allDone) {
                break;
            }
            usleep(50_000);
        }

        // Release the coordinator barrier lock so both waiting workers race immediately.
        $holder->rollBack();

        $results = [];
        foreach ($procs as $i => $proc) {
            $stdout = stream_get_contents($pipesList[$i][1]);
            $stderr = stream_get_contents($pipesList[$i][2]);
            fclose($pipesList[$i][1]);
            fclose($pipesList[$i][2]);
            $exit = proc_close($proc);
            $this->assertSame(0, $exit, "Worker {$i} exited {$exit}: {$stderr} {$stdout}");
            $results[$i] = json_decode((string) $stdout, true, flags: JSON_THROW_ON_ERROR);
        }

        return [$results[0], $results[1], $observedWaiters];
    }

    private function expectUniqueViolation(callable $fn): void
    {
        try {
            $fn();
            $this->fail('Expected MySQL UniqueConstraintViolationException.');
        } catch (UniqueConstraintViolationException) {
            $this->addToAssertionCount(1);
        }
    }

    /** @return array<string, mixed> */
    private function seedChapterContext(): array
    {
        $chapterId = (string) Str::uuid();
        $custodianId = (string) Str::uuid();
        $receiverId = (string) Str::uuid();
        $headId = (string) Str::uuid();
        $financeId = (string) Str::uuid();
        $suffix = substr(str_replace('-', '', $chapterId), 0, 8);

        Chapter::create(['id' => $chapterId, 'code' => 'SYN-'.$suffix, 'name' => 'Chapter '.$suffix, 'status' => 'live', 'version' => 1]);

        foreach ([
            [$custodianId, "custodian-{$suffix}@example.invalid", 'Custodian', ['INVENTORY']],
            [$receiverId, "receiver-{$suffix}@example.invalid", 'Receiver', ['INDEPENDENT_REVIEWER', 'RECEIVING']],
            [$headId, "head-{$suffix}@example.invalid", 'Head', ['CHAPTER_HEAD']],
            [$financeId, "finance-{$suffix}@example.invalid", 'Finance', ['FINANCE']],
        ] as [$uid, $email, $name, $duties]) {
            User::create([
                'id' => $uid, 'public_id' => $email, 'name' => $name, 'email' => $email,
                'password_hash' => hash('sha256', 'Password123!'), 'status' => 'active', 'version' => 1,
            ]);
            ChapterMembership::create([
                'id' => (string) Str::uuid(), 'chapter_id' => $chapterId, 'user_id' => $uid,
                'membership_status' => 'active', 'version' => 1,
            ]);
            foreach ($duties as $duty) {
                DutyGrant::create([
                    'id' => (string) Str::uuid(), 'chapter_id' => $chapterId, 'user_id' => $uid,
                    'duty_code' => $duty, 'status' => 'active', 'is_alternate' => false,
                    'valid_from' => now()->subDay(), 'version' => 1,
                ]);
            }
        }

        $unitId = (string) Str::uuid();
        CatalogueUnit::create([
            'id' => $unitId, 'chapter_id' => $chapterId, 'code' => 'PCS', 'name' => 'Pieces',
            'quantity_kind' => 'piece', 'quantity_scale' => 0, 'state' => 'active', 'material_version' => 1,
        ]);
        $itemId = (string) Str::uuid();
        CatalogueItem::create([
            'id' => $itemId, 'chapter_id' => $chapterId, 'code' => 'SHIRT', 'name' => 'Shirt',
            'unit_id' => $unitId, 'state' => 'active', 'material_version' => 1,
        ]);
        $variantId = (string) Str::uuid();
        CatalogueVariant::create([
            'id' => $variantId, 'chapter_id' => $chapterId, 'item_id' => $itemId,
            'sku' => 'SHIRT-M', 'name' => 'Example shirt / M', 'unit_id' => $unitId,
            'quantity_scale' => 0, 'state' => 'active', 'material_version' => 1,
        ]);
        $locationId = (string) Str::uuid();
        CatalogueLocation::create([
            'id' => $locationId, 'chapter_id' => $chapterId, 'code' => 'MAIN', 'name' => 'Main Stockroom',
            'kind' => 'stockroom', 'custodian_id' => $custodianId, 'state' => 'active', 'material_version' => 1,
        ]);

        $policies = [];
        foreach ([
            'ipc_authorization' => ['CHAPTER_HEAD', $headId, 'IpcAuthorizationPolicyValue', [
                'cutoff_at' => $this->cutoffAt, 'count_team_ids' => [$custodianId, $receiverId], 'suspension_record_reference' => 'SUSP-1',
            ]],
            'reference_series' => ['CHAPTER_HEAD', $headId, 'OpeningReferencePolicyValue', [
                'ipc_prefix' => 'CEB-IPC', 'rm_prefix' => 'CEB-RM', 'minimum_digits' => 6,
            ]],
            'valuation_rounding' => ['FINANCE', $financeId, 'OpeningValuationPolicyValue', [
                'currency' => 'PHP', 'unit_value_scale' => 2, 'rounding_mode' => 'half_up', 'round_at' => 'accepted_line', 'valuation_basis_reference' => 'VAL-1',
            ]],
        ] as $key => [$owner, $approverId, $schema, $value]) {
            $pid = (string) Str::uuid();
            PolicyRecord::create([
                'id' => $pid, 'aggregate_id' => $pid, 'chapter_id' => $chapterId,
                'policy_code' => $key, 'policy_version' => 1, 'rules_json' => $value, 'effective_from' => now('UTC')->subHour(),
            ]);
            AuditLog::create([
                'chapter_id' => $chapterId, 'user_id' => $approverId, 'action' => 'controlled:recordPolicy',
                'entity_type' => 'policy', 'entity_id' => $pid,
                'details' => [
                    'version' => 1, 'subject_id' => null, 'value_schema_reference' => '#/components/schemas/'.$schema,
                    'value_sha256' => CanonicalJson::sha256($value), 'approvals' => [['authority' => $owner, 'approver_id' => $approverId]],
                ],
            ]);
            $policies[] = ['setting_key' => $key, 'policy_id' => $pid, 'version' => 1];
        }

        return [
            'chapter_id' => $chapterId, 'custodian_id' => $custodianId, 'receiver_id' => $receiverId,
            'head_id' => $headId, 'finance_id' => $financeId, 'unit_id' => $unitId,
            'item_id' => $itemId, 'variant_id' => $variantId, 'location_id' => $locationId, 'policies' => $policies,
        ];
    }

    /** @return array{ipc_id: string, rm_id: string, rm_revision: int, acknowledgment_id: string} */
    private function prepareMatchedCandidate(array $ctx, string $usableQty, string $dmgQty, string $rejQty, string $acceptedVal): array
    {
        $chapterId = $ctx['chapter_id'];
        $ipcLines = [];
        $rmLines = [];

        $makeLine = fn (string $id, string $cond, string $qty): array => [
            'line_id' => $id, 'item_id' => $ctx['item_id'], 'variant_id' => $ctx['variant_id'], 'variant_material_version' => 1,
            'unit_id' => $ctx['unit_id'], 'unit_material_version' => 1, 'quantity_scale' => 0, 'historical_variant_label' => 'Example shirt / M',
            'location_id' => $ctx['location_id'], 'location_material_version' => 1, 'regular_custodian_ids' => [$ctx['custodian_id']],
            'condition' => $cond, 'counted_quantity' => $qty, 'unit_value' => '25.00', 'valuation_basis' => 'Cost', 'provenance_reference' => 'O-1',
            'restrictions' => ['state' => 'unrestricted', 'allowed_uses' => ['internal_use'], 'event_ids' => [], 'requesting_unit_ids' => [], 'effective_from' => null, 'effective_until' => null, 'interpretation_id' => null, 'source_condition_reference' => null],
        ];

        $l1 = (string) Str::uuid();
        $ipcLines[] = $makeLine($l1, 'usable', $usableQty);
        $rmLines[] = ['ipc_line_id' => $l1, 'accepted_quantity' => $usableQty, 'damaged_quantity' => '0', 'rejected_quantity' => '0', 'accepted_value' => $acceptedVal, 'finding_reason' => null];

        if ((int) $dmgQty > 0) {
            $l2 = (string) Str::uuid();
            $ipcLines[] = $makeLine($l2, 'damaged', $dmgQty);
            $rmLines[] = ['ipc_line_id' => $l2, 'accepted_quantity' => '0', 'damaged_quantity' => $dmgQty, 'rejected_quantity' => '0', 'accepted_value' => '0.00', 'finding_reason' => 'Damaged'];
        }
        if ((int) $rejQty > 0) {
            $l3 = (string) Str::uuid();
            $ipcLines[] = $makeLine($l3, 'rejected', $rejQty);
            $rmLines[] = ['ipc_line_id' => $l3, 'accepted_quantity' => '0', 'damaged_quantity' => '0', 'rejected_quantity' => $rejQty, 'accepted_value' => '0.00', 'finding_reason' => 'Rejected'];
        }

        $ipcId = $this->asOfficer($ctx['custodian_id'], (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$chapterId}/ipcs", [
                'material' => ['cutoff_at' => null, 'informal_movements_suspended' => false, 'count_team' => [], 'policies' => [], 'lines' => [], 'notes' => null],
            ])->assertCreated()->json('data.record.id');

        $rmId = $this->asOfficer($ctx['receiver_id'], (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$chapterId}/opening-rms", [
                'ipc_id' => $ipcId, 'material' => ['ipc_material_version' => 1, 'lines' => [], 'notes' => null],
            ])->assertCreated()->json('data.record.id');

        $this->asOfficer($ctx['custodian_id'], (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$chapterId}/ipcs/{$ipcId}", [
                'expected_revision' => 1, 'reason' => 'Populate',
                'material' => [
                    'cutoff_at' => $this->cutoffAt, 'informal_movements_suspended' => true,
                    'count_team' => [['user_id' => $ctx['custodian_id'], 'regular_custodian' => true], ['user_id' => $ctx['receiver_id'], 'regular_custodian' => false]],
                    'policies' => $ctx['policies'], 'lines' => $ipcLines, 'notes' => null,
                ],
            ])->assertOk();

        $countedAt = now('UTC')->subMinutes(4)->format('Y-m-d\TH:i:s.u\Z');
        $entries = array_map(fn (array $l) => ['ipc_line_id' => $l['line_id'], 'quantity' => $l['counted_quantity'], 'condition' => $l['condition'], 'notes' => null], $ipcLines);

        $this->asOfficer($ctx['custodian_id'], (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 2, 'material_version' => 2, 'counted_at' => $countedAt, 'completed' => true, 'signed_at' => $countedAt, 'entries' => $entries,
            ])->assertOk();
        $this->asOfficer($ctx['receiver_id'], (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$chapterId}/ipcs/{$ipcId}/my-count", [
                'expected_revision' => 3, 'material_version' => 2, 'counted_at' => $countedAt, 'completed' => true, 'signed_at' => $countedAt, 'entries' => $entries,
            ])->assertOk();

        $paper = $this->uploadPaper($chapterId, $ctx['receiver_id'], $rmId, (string) Str::uuid())->assertCreated()->json('data');
        $bytes = ['evidence_id' => $paper['evidence_id'], 'version_id' => $paper['version_id'], 'attachments' => array_map(fn ($a) => ['attachment_id' => $a['attachment_id'], 'sha256' => $a['sha256']], $paper['attachments'])];

        $this->asOfficer($ctx['custodian_id'], (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$chapterId}/ipcs/{$ipcId}/submit", ['expected_revision' => 4, 'material_version' => 2, 'signed_ipc' => $bytes])->assertOk();

        $authAt = now('UTC')->subMinutes(3)->format('Y-m-d\TH:i:s.u\Z');
        $this->asOfficer($ctx['head_id'], (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$chapterId}/ipcs/{$ipcId}/authorizations", ['expected_revision' => 5, 'material_version' => 2, 'duty' => 'CHAPTER_HEAD', 'signed_at' => $authAt])->assertOk();
        $this->asOfficer($ctx['finance_id'], (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$chapterId}/ipcs/{$ipcId}/authorizations", ['expected_revision' => 6, 'material_version' => 2, 'duty' => 'FINANCE', 'signed_at' => $authAt])->assertOk();

        $this->asOfficer($ctx['receiver_id'], (string) Str::uuid())
            ->putJson("/api/v1/chapters/{$chapterId}/opening-rms/{$rmId}", ['expected_revision' => 1, 'reason' => 'Inspect lines', 'material' => ['ipc_material_version' => 2, 'lines' => $rmLines, 'notes' => null]])->assertOk();

        $inspected = $this->asOfficer($ctx['receiver_id'], (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$chapterId}/opening-rms/{$rmId}/inspection", [
                'expected_revision' => 2, 'ipc_material_version' => 2, 'inspected_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
                'technical_representative_id' => null, 'inspection_notes' => 'Inspected',
            ])->assertOk();

        $matched = $this->asOfficer($ctx['receiver_id'], (string) Str::uuid())
            ->postJson("/api/v1/chapters/{$chapterId}/opening-rms/{$rmId}/evidence-match", [
                'expected_revision' => 3, 'material_version' => 2, 'snapshot_sha256' => $inspected->json('data.record.snapshot_sha256'),
                'bytes' => $bytes, 'acknowledged_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
            ])->assertOk();

        return [
            'ipc_id' => $ipcId,
            'rm_id' => $rmId,
            'rm_revision' => (int) $matched->json('data.record.revision'),
            'acknowledgment_id' => (string) $matched->json('data.record.acknowledgment.acknowledgment_id'),
        ];
    }

    private function uploadPaper(string $chapterId, string $userId, string $recordId, string $key): TestResponse
    {
        $boundary = 'ysp-mysql-boundary';
        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach (['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 72 72] >>'] as $i => $obj) {
            $offsets[] = sprintf("%010d 00000 n \n", strlen($pdf));
            $pdf .= ($i + 1)." 0 obj\n{$obj}\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= "xref\n0 4\n0000000000 65535 f \n".implode('', $offsets)."trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF\n";

        $raw = "--{$boundary}\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\nopening_receipt\r\n"
            ."--{$boundary}\r\nContent-Disposition: form-data; name=\"record_id\"\r\n\r\n{$recordId}\r\n"
            ."--{$boundary}\r\nContent-Disposition: form-data; name=\"attachments\"; filename=\"signed.pdf\"\r\n"
            ."Content-Type: application/pdf\r\n\r\n{$pdf}\r\n"
            ."--{$boundary}--\r\n";

        $this->asOfficer($userId, $key);

        return $this->call(
            'POST',
            "/api/v1/chapters/{$chapterId}/evidence",
            cookies: $this->prepareCookiesForRequest(),
            server: $this->transformHeadersToServerVars(['Accept' => 'application/json'])
                + ['CONTENT_TYPE' => "multipart/form-data; boundary={$boundary}"],
            content: $raw,
        );
    }

    private function asOfficer(string $userId, ?string $actionKey = null): self
    {
        $session = $this->sessionFor($userId);
        $headers = ['Accept' => 'application/json', 'Origin' => $this->origin, 'X-XSRF-TOKEN' => $session['csrf']];
        if ($actionKey !== null) {
            $headers['X-Action-Key'] = $actionKey;
        }

        return $this->flushHeaders()->withCredentials()->withUnencryptedCookie('ysp_session', $session['token'])->withHeaders($headers);
    }

    /** @return array{token: string, csrf: string} */
    private function sessionFor(string $userId): array
    {
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
