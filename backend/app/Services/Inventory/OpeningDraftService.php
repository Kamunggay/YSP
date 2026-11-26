<?php

namespace App\Services\Inventory;

use App\Exceptions\ContractException;
use App\Http\Requests\OpeningDraftInput;
use App\Models\ActionReceipt;
use App\Models\AuditLog;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\ChapterMembership;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\OpeningCount;
use App\Models\OpeningRecordHistory;
use App\Models\OpeningRm;
use App\Models\PolicyRecord;
use App\Services\Authority\ChapterAuthority;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\CanonicalJson;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class OpeningDraftService
{
    private const IPC_STATES = ['draft', 'awaiting_authorization', 'authorized', 'posted'];

    private const RM_STATES = ['draft', 'inspected', 'matched', 'posted'];

    private const POLICY_RULES = [
        'ipc_authorization' => ['CHAPTER_HEAD', 'IpcAuthorizationPolicyValue'],
        'reference_series' => ['CHAPTER_HEAD', 'OpeningReferencePolicyValue'],
        'valuation_rounding' => ['FINANCE', 'OpeningValuationPolicyValue'],
    ];

    private const PRINT_CSP = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

    public function __construct(
        private readonly DomainNotificationOutboxService $outbox,
    ) {}

    public function listIpcs(Request $request, string $chapterId): JsonResponse
    {
        $selectors = OpeningDraftInput::selectors($request, ['limit', 'cursor', 'state']);
        $limit = $this->parseLimit($selectors['limit'] ?? null);
        $state = $selectors['state'] ?? null;
        if ($state !== null && ! in_array($state, self::IPC_STATES, true)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid IPC state selector.');
        }

        $query = OpeningCount::where('chapter_id', $chapterId)
            ->orderByDesc('created_at')
            ->orderBy('id')
            ->sharedLock();

        $all = $query->get();
        $filtered = $state === null
            ? $all
            : $all->filter(fn (OpeningCount $ipc) => self::ipcState($ipc) === $state)->values();

        $snapshotVersion = 1 + (int) $all->sum('revision');
        $items = $filtered->map(fn (OpeningCount $ipc) => $this->formatIpc($ipc))->all();

        return $this->paginatedResponse(
            $request,
            $chapterId,
            'listIpcs',
            ['state' => $state],
            $limit,
            $selectors['cursor'] ?? null,
            $items,
            $snapshotVersion,
        );
    }

    public function createIpc(Request $request, string $chapterId): JsonResponse
    {
        [$key, $payload] = OpeningDraftInput::parseWrite($request, [OpeningDraftInput::class, 'validateCreateIpc']);
        $actor = $request->user()->id;
        $authority = $this->authority($request);

        return $this->runIdempotentWrite(
            $chapterId,
            $actor,
            'createIpc',
            $key,
            null,
            $payload,
            201,
            function (string $operationId) use ($chapterId, $actor, $authority, $key, $payload): array {
                $this->assertBaselineNotPosted($chapterId);
                $material = $this->validateIpcMaterial($authority, $chapterId, null, $payload['material']);
                $now = now('UTC')->startOfSecond();

                $ipc = OpeningCount::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $chapterId,
                    'ipc_number' => null,
                    'status' => 'draft',
                    'notes' => $material['notes'],
                    'revision' => 1,
                    'material_version' => 1,
                    'created_by' => $actor,
                    'material_json' => $material,
                    'counts_json' => [],
                    'signed_ipc_json' => null,
                    'authorizations_json' => [],
                    'posted_rm_id' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                $record = $this->formatIpc($ipc);
                $operation = $this->operationReceipt($operationId, 'createIpc', $key, $actor, $chapterId, 'ipc', $ipc->id, 1, 1, 201, $now);
                $this->recordHistoryAndOutbox('IPC', $ipc->id, $chapterId, 1, 1, 'created', $actor, $record, $operation, null, 'stage1.ipc.changed.v1');

                return ['data' => ['operation' => $operation, 'record' => $record, 'posting' => null]];
            },
        );
    }

    public function readIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        OpeningDraftInput::requireUuid($ipcId, 'ipc_id');
        OpeningDraftInput::selectors($request);

        $ipc = $this->findIpc($chapterId, $ipcId, lock: false);

        return response()->json(['data' => $this->formatIpc($ipc)]);
    }

    public function replaceIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        OpeningDraftInput::requireUuid($ipcId, 'ipc_id');
        [$key, $payload] = OpeningDraftInput::parseWrite($request, [OpeningDraftInput::class, 'validateReplaceIpc']);
        $actor = $request->user()->id;
        $authority = $this->authority($request);

        return $this->runIdempotentWrite(
            $chapterId,
            $actor,
            'replaceIpc',
            $key,
            $ipcId,
            $payload,
            200,
            function (string $operationId) use ($chapterId, $ipcId, $actor, $authority, $key, $payload): array {
                $ipc = $this->findIpc($chapterId, $ipcId, lock: true);
                if (self::ipcState($ipc) === 'posted') {
                    throw new ContractException(409, 'target_locked', 'Posted IPC cannot be replaced.');
                }
                $this->assertBaselineNotPosted($chapterId);
                if ((int) $ipc->revision !== $payload['expected_revision']) {
                    throw new ContractException(409, 'version_conflict', 'IPC revision is stale.');
                }

                $material = $this->validateIpcMaterial($authority, $chapterId, $ipc->id, $payload['material']);
                $now = now('UTC')->startOfSecond();

                $ipc->status = 'draft';
                $ipc->notes = $material['notes'];
                $ipc->revision = (int) $ipc->revision + 1;
                $ipc->material_version = (int) $ipc->material_version + 1;
                $ipc->material_json = $material;
                $ipc->counts_json = [];
                $ipc->signed_ipc_json = null;
                $ipc->authorizations_json = [];
                $ipc->submitted_at = null;
                $ipc->authorized_head_by = null;
                $ipc->authorized_finance_by = null;
                $ipc->authorized_at = null;
                $ipc->authorized_head_signature = null;
                $ipc->authorized_finance_signature = null;
                $ipc->updated_at = $now;
                $ipc->save();

                $this->invalidateDependentRms($chapterId, $ipc->id, $actor, $key, $now);

                $record = $this->formatIpc($ipc);
                $operation = $this->operationReceipt($operationId, 'replaceIpc', $key, $actor, $chapterId, 'ipc', $ipc->id, (int) $ipc->revision, (int) $ipc->material_version, 200, $now);
                $this->recordHistoryAndOutbox('IPC', $ipc->id, $chapterId, (int) $ipc->revision, (int) $ipc->material_version, 'replaced', $actor, $record, $operation, $payload['reason'], 'stage1.ipc.changed.v1');

                return ['data' => ['operation' => $operation, 'record' => $record, 'posting' => null]];
            },
            verifyReplayTarget: fn () => $this->findIpc($chapterId, $ipcId, lock: false),
        );
    }

    public function saveMyIpcCount(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        OpeningDraftInput::requireUuid($ipcId, 'ipc_id');
        [$key, $payload] = OpeningDraftInput::parseWrite($request, [OpeningDraftInput::class, 'validateSaveIpcCount']);
        $actor = $request->user()->id;

        return $this->runIdempotentWrite(
            $chapterId,
            $actor,
            'saveMyIpcCount',
            $key,
            $ipcId,
            $payload,
            200,
            function (string $operationId) use ($chapterId, $ipcId, $actor, $key, $payload): array {
                $ipc = $this->findIpc($chapterId, $ipcId, lock: true);
                $material = $this->normalizedIpcMaterial($ipc);
                $teamIds = array_column($material['count_team'], 'user_id');
                if (! in_array($actor, $teamIds, true)) {
                    throw new ContractException(403, 'duty_denied', 'Only named count team members may record counts.');
                }

                $state = self::ipcState($ipc);
                if ($state === 'posted') {
                    throw new ContractException(409, 'target_locked', 'Posted IPC cannot be counted.');
                }
                if ($state !== 'draft') {
                    throw new ContractException(409, 'invalid_transition', 'Counts may only be saved while IPC is in draft.');
                }
                $this->assertBaselineNotPosted($chapterId);

                if ((int) $ipc->revision !== $payload['expected_revision']) {
                    throw new ContractException(409, 'version_conflict', 'IPC revision is stale.');
                }
                if ((int) $ipc->material_version !== $payload['material_version']) {
                    throw new ContractException(409, 'snapshot_stale', 'IPC material version is stale.');
                }

                $now = now('UTC');
                $countedAt = $payload['counted_at'] !== null ? CarbonImmutable::parse($payload['counted_at'], 'UTC') : null;
                $signedAt = $payload['signed_at'] !== null ? CarbonImmutable::parse($payload['signed_at'], 'UTC') : null;
                $cutoffAt = $material['cutoff_at'] !== null ? CarbonImmutable::parse($material['cutoff_at'], 'UTC') : null;

                if (($countedAt && $countedAt->gt($now)) || ($signedAt && $signedAt->gt($now))) {
                    throw new ContractException(409, 'invalid_source', 'Count and signature timestamps cannot be in the future.');
                }
                if ($cutoffAt && $countedAt && $countedAt->lt($cutoffAt)) {
                    throw new ContractException(409, 'invalid_source', 'Count timestamp cannot precede cutoff.');
                }
                if ($countedAt && $signedAt && $signedAt->lt($countedAt)) {
                    throw new ContractException(409, 'invalid_source', 'Signature timestamp cannot precede count timestamp.');
                }

                $linesById = [];
                foreach ($material['lines'] as $line) {
                    $linesById[$line['line_id']] = $line;
                }

                $seen = [];
                $entries = [];
                foreach ($payload['entries'] as $entry) {
                    $lineId = $entry['ipc_line_id'];
                    if (isset($seen[$lineId]) || ! isset($linesById[$lineId])) {
                        throw new ContractException(409, 'invalid_source', 'Count entries must reference each IPC line at most once.');
                    }
                    $seen[$lineId] = true;
                    if ($entry['quantity'] !== null && ! $this->fitsScale($entry['quantity'], (int) $linesById[$lineId]['quantity_scale'])) {
                        throw new ContractException(409, 'invalid_source', 'Count quantity exceeds the approved unit scale.');
                    }
                    $entries[] = $entry;
                }

                if ($payload['completed']) {
                    if ($linesById === [] || $countedAt === null || $signedAt === null || count($entries) !== count($linesById)) {
                        throw new ContractException(409, 'source_incomplete', 'Completed count must cover every IPC line with count and sign timestamps.');
                    }
                    foreach ($entries as $entry) {
                        if ($entry['quantity'] === null || $entry['condition'] === null) {
                            throw new ContractException(409, 'source_incomplete', 'Completed count entries require quantity and condition.');
                        }
                    }
                }

                usort($entries, fn (array $a, array $b) => strcmp($a['ipc_line_id'], $b['ipc_line_id']));

                $counts = array_values(array_filter(
                    (array) ($ipc->counts_json ?? []),
                    fn (array $existing) => ($existing['actor_id'] ?? null) !== $actor
                ));
                $counts[] = [
                    'actor_id' => $actor,
                    'material_version' => (int) $ipc->material_version,
                    'counted_at' => $payload['counted_at'],
                    'completed' => $payload['completed'],
                    'signed_at' => $payload['signed_at'],
                    'entries' => $entries,
                ];
                usort($counts, fn (array $a, array $b) => strcmp($a['actor_id'], $b['actor_id']));

                $committedAt = $now->startOfSecond();
                $ipc->counts_json = $counts;
                $ipc->revision = (int) $ipc->revision + 1;
                $ipc->updated_at = $committedAt;
                $ipc->save();

                $record = $this->formatIpc($ipc);
                $operation = $this->operationReceipt($operationId, 'saveMyIpcCount', $key, $actor, $chapterId, 'ipc', $ipc->id, (int) $ipc->revision, (int) $ipc->material_version, 200, $committedAt);
                $this->recordHistoryAndOutbox('IPC', $ipc->id, $chapterId, (int) $ipc->revision, (int) $ipc->material_version, 'count_saved', $actor, $record, $operation, null, 'stage1.ipc.changed.v1');

                return ['data' => ['operation' => $operation, 'record' => $record, 'posting' => null]];
            },
            verifyReplayTarget: function () use ($chapterId, $ipcId, $actor): void {
                $ipc = $this->findIpc($chapterId, $ipcId, lock: false);
                $teamIds = array_column($this->normalizedIpcMaterial($ipc)['count_team'], 'user_id');
                if (! in_array($actor, $teamIds, true)) {
                    throw new ContractException(403, 'duty_denied', 'Only named count team members may record counts.');
                }
            },
        );
    }

    public function listIpcHistory(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        OpeningDraftInput::requireUuid($ipcId, 'ipc_id');
        $selectors = OpeningDraftInput::selectors($request, ['limit', 'cursor']);
        $limit = $this->parseLimit($selectors['limit'] ?? null);
        $ipc = $this->findIpc($chapterId, $ipcId, lock: false);

        return $this->listHistory($request, $chapterId, 'IPC', $ipc->id, (int) $ipc->revision, $limit, $selectors['cursor'] ?? null);
    }

    public function readIpcRevision(Request $request, string $chapterId, string $ipcId, string $revision): JsonResponse
    {
        OpeningDraftInput::requireUuid($ipcId, 'ipc_id');
        $revInt = OpeningDraftInput::requireRevision($revision);
        OpeningDraftInput::selectors($request);

        $this->findIpc($chapterId, $ipcId, lock: false);
        $entry = OpeningRecordHistory::where('chapter_id', $chapterId)
            ->where('record_type', 'IPC')
            ->where('record_id', $ipcId)
            ->where('revision', $revInt)
            ->sharedLock()
            ->first();

        if (! $entry) {
            throw new ContractException(404, 'resource_not_found', 'Resource not found.');
        }

        return response()->json(['data' => $entry->snapshot_json]);
    }

    public function readIpcRelated(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        OpeningDraftInput::requireUuid($ipcId, 'ipc_id');
        OpeningDraftInput::selectors($request);

        $ipc = $this->findIpc($chapterId, $ipcId, lock: false);

        return response()->json(['data' => $this->relatedPayload($this->authority($request), $chapterId, $ipc)]);
    }

    public function printIpc(Request $request, string $chapterId, string $ipcId): Response
    {
        OpeningDraftInput::requireUuid($ipcId, 'ipc_id');
        OpeningDraftInput::selectors($request);

        $ipc = $this->findIpc($chapterId, $ipcId, lock: false);
        $data = $this->formatIpc($ipc);

        $ref = e($data['reference'] ?? 'UNSUBMITTED');
        $state = e($data['state']);
        $cutoff = e($data['material']['cutoff_at'] ?? 'UNSET');
        $linesHtml = '';
        foreach ($data['material']['lines'] as $line) {
            $label = e($line['historical_variant_label']);
            $cond = e($line['condition']);
            $qty = e($line['counted_quantity'] ?? 'UNCOUNTED');
            $val = e($line['unit_value'] ?? 'UNVALUED');
            $linesHtml .= "<tr><td>{$label}</td><td>{$cond}</td><td>{$qty}</td><td>{$val}</td></tr>";
        }
        $countsCount = count($data['counts']);
        $html = '<!doctype html><html><body><h1>Inventory Physical Count</h1>'
            ."<p>Reference: {$ref} | State: {$state} | Revision: {$data['revision']} | Material Version: {$data['material_version']}</p>"
            ."<p>Cutoff: {$cutoff} | Recorded Counters: {$countsCount}</p>"
            ."<table><thead><tr><th>Item</th><th>Condition</th><th>Quantity</th><th>Unit Value (PHP)</th></tr></thead><tbody>{$linesHtml}</tbody></table>"
            .'<p>Printing does not post physical stock.</p></body></html>';

        return $this->printResponse($html);
    }

    public function listOpeningRms(Request $request, string $chapterId): JsonResponse
    {
        $selectors = OpeningDraftInput::selectors($request, ['limit', 'cursor', 'state', 'ipc_id']);
        $limit = $this->parseLimit($selectors['limit'] ?? null);
        $state = $selectors['state'] ?? null;
        if ($state !== null && ! in_array($state, self::RM_STATES, true)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid Opening RM state selector.');
        }

        $ipcFilter = $selectors['ipc_id'] ?? null;
        if ($ipcFilter !== null) {
            OpeningDraftInput::requireUuid($ipcFilter, 'ipc_id');
            $this->findIpc($chapterId, $ipcFilter, lock: false);
        }

        $all = OpeningRm::where('chapter_id', $chapterId)
            ->orderByDesc('created_at')
            ->orderBy('id')
            ->sharedLock()
            ->get();

        $filtered = $all->filter(function (OpeningRm $rm) use ($state, $ipcFilter): bool {
            if ($state !== null && self::rmState($rm) !== $state) {
                return false;
            }
            if ($ipcFilter !== null && $rm->ipc_id !== $ipcFilter) {
                return false;
            }

            return true;
        })->values();

        $snapshotVersion = 1 + (int) $all->sum('revision');
        $items = $filtered->map(fn (OpeningRm $rm) => $this->formatRm($rm))->all();

        return $this->paginatedResponse(
            $request,
            $chapterId,
            'listOpeningRms',
            ['state' => $state, 'ipc_id' => $ipcFilter],
            $limit,
            $selectors['cursor'] ?? null,
            $items,
            $snapshotVersion,
        );
    }

    public function createOpeningRm(Request $request, string $chapterId): JsonResponse
    {
        [$key, $payload] = OpeningDraftInput::parseWrite($request, [OpeningDraftInput::class, 'validateCreateOpeningRm']);
        $actor = $request->user()->id;

        return $this->runIdempotentWrite(
            $chapterId,
            $actor,
            'createOpeningRm',
            $key,
            null,
            $payload,
            201,
            function (string $operationId) use ($chapterId, $actor, $key, $payload): array {
                $this->assertBaselineNotPosted($chapterId);
                $ipc = $this->findIpc($chapterId, $payload['ipc_id'], lock: false);
                if (self::ipcState($ipc) === 'posted') {
                    throw new ContractException(409, 'target_locked', 'Posted IPC cannot receive a new Opening RM.');
                }

                $material = $this->validateRmMaterial($ipc, $payload['material']);
                $now = now('UTC')->startOfSecond();

                $rm = OpeningRm::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $chapterId,
                    'rm_number' => null,
                    'ipc_id' => $ipc->id,
                    'status' => 'draft',
                    'prepared_by' => $actor,
                    'notes' => $material['notes'],
                    'revision' => 1,
                    'material_version' => 1,
                    'material_json' => $material,
                    'lines_data' => $material['lines'],
                    'inspection_data' => null,
                    'snapshot_data' => null,
                    'snapshot_sha256' => null,
                    'acknowledgment_json' => null,
                    'posted_at' => null,
                    'outcome_id' => null,
                    'posted_chapter_id' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                $record = $this->formatRm($rm);
                $operation = $this->operationReceipt($operationId, 'createOpeningRm', $key, $actor, $chapterId, 'opening_rm', $rm->id, 1, 1, 201, $now);
                $this->recordHistoryAndOutbox('OPENING_RM', $rm->id, $chapterId, 1, 1, 'created', $actor, $record, $operation, null, 'stage1.opening-rm.changed.v1');

                return ['data' => ['operation' => $operation, 'record' => $record, 'posting' => null]];
            },
        );
    }

    public function readOpeningRm(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        OpeningDraftInput::requireUuid($rmId, 'rm_id');
        OpeningDraftInput::selectors($request);

        $rm = $this->findRm($chapterId, $rmId, lock: false);

        return response()->json(['data' => $this->formatRm($rm)]);
    }

    public function replaceOpeningRm(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        OpeningDraftInput::requireUuid($rmId, 'rm_id');
        [$key, $payload] = OpeningDraftInput::parseWrite($request, [OpeningDraftInput::class, 'validateReplaceOpeningRm']);
        $actor = $request->user()->id;

        return $this->runIdempotentWrite(
            $chapterId,
            $actor,
            'replaceOpeningRm',
            $key,
            $rmId,
            $payload,
            200,
            function (string $operationId) use ($chapterId, $rmId, $actor, $key, $payload): array {
                $rm = $this->findRm($chapterId, $rmId, lock: true);
                if (self::rmState($rm) === 'posted') {
                    throw new ContractException(409, 'target_locked', 'Posted Opening RM cannot be replaced.');
                }
                $this->assertBaselineNotPosted($chapterId);
                if ((int) $rm->revision !== $payload['expected_revision']) {
                    throw new ContractException(409, 'version_conflict', 'Opening RM revision is stale.');
                }

                $ipc = $this->findIpc($chapterId, $rm->ipc_id, lock: false);
                $material = $this->validateRmMaterial($ipc, $payload['material']);
                $now = now('UTC')->startOfSecond();

                $rm->status = 'draft';
                $rm->notes = $material['notes'];
                $rm->revision = (int) $rm->revision + 1;
                $rm->material_version = (int) $rm->material_version + 1;
                $rm->material_json = $material;
                $rm->lines_data = $material['lines'];
                $rm->inspector_user_id = null;
                $rm->evidence_binding_id = null;
                $rm->inspection_data = null;
                $rm->snapshot_data = null;
                $rm->snapshot_sha256 = null;
                $rm->acknowledgment_json = null;
                $rm->updated_at = $now;
                $rm->save();

                $record = $this->formatRm($rm);
                $operation = $this->operationReceipt($operationId, 'replaceOpeningRm', $key, $actor, $chapterId, 'opening_rm', $rm->id, (int) $rm->revision, (int) $rm->material_version, 200, $now);
                $this->recordHistoryAndOutbox('OPENING_RM', $rm->id, $chapterId, (int) $rm->revision, (int) $rm->material_version, 'replaced', $actor, $record, $operation, $payload['reason'], 'stage1.opening-rm.changed.v1');

                return ['data' => ['operation' => $operation, 'record' => $record, 'posting' => null]];
            },
            verifyReplayTarget: fn () => $this->findRm($chapterId, $rmId, lock: false),
        );
    }

    public function listOpeningRmHistory(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        OpeningDraftInput::requireUuid($rmId, 'rm_id');
        $selectors = OpeningDraftInput::selectors($request, ['limit', 'cursor']);
        $limit = $this->parseLimit($selectors['limit'] ?? null);
        $rm = $this->findRm($chapterId, $rmId, lock: false);

        return $this->listHistory($request, $chapterId, 'OPENING_RM', $rm->id, (int) $rm->revision, $limit, $selectors['cursor'] ?? null);
    }

    public function readOpeningRmRevision(Request $request, string $chapterId, string $rmId, string $revision): JsonResponse
    {
        OpeningDraftInput::requireUuid($rmId, 'rm_id');
        $revInt = OpeningDraftInput::requireRevision($revision);
        OpeningDraftInput::selectors($request);

        $this->findRm($chapterId, $rmId, lock: false);
        $entry = OpeningRecordHistory::where('chapter_id', $chapterId)
            ->where('record_type', 'OPENING_RM')
            ->where('record_id', $rmId)
            ->where('revision', $revInt)
            ->sharedLock()
            ->first();

        if (! $entry) {
            throw new ContractException(404, 'resource_not_found', 'Resource not found.');
        }

        return response()->json(['data' => $entry->snapshot_json]);
    }

    public function readOpeningRmRelated(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        OpeningDraftInput::requireUuid($rmId, 'rm_id');
        OpeningDraftInput::selectors($request);

        $rm = $this->findRm($chapterId, $rmId, lock: false);
        $ipc = $this->findIpc($chapterId, $rm->ipc_id, lock: false);

        return response()->json(['data' => $this->relatedPayload($this->authority($request), $chapterId, $ipc, $rm)]);
    }

    public function printOpeningRm(Request $request, string $chapterId, string $rmId): Response
    {
        OpeningDraftInput::requireUuid($rmId, 'rm_id');
        OpeningDraftInput::selectors($request);

        $rm = $this->findRm($chapterId, $rmId, lock: false);
        $data = $this->formatRm($rm);

        $ref = e($data['reference'] ?? 'UNPOSTED');
        $state = e($data['state']);
        $ipcId = e($data['ipc_id']);
        $linesHtml = '';
        foreach ($data['material']['lines'] as $line) {
            $lid = e($line['ipc_line_id']);
            $acc = e($line['accepted_quantity'] ?? 'UNSET');
            $dmg = e($line['damaged_quantity'] ?? 'UNSET');
            $rej = e($line['rejected_quantity'] ?? 'UNSET');
            $val = e($line['accepted_value'] ?? 'UNSET');
            $linesHtml .= "<tr><td>{$lid}</td><td>{$acc}</td><td>{$dmg}</td><td>{$rej}</td><td>{$val}</td></tr>";
        }
        $html = '<!doctype html><html><body><h1>Opening Receiving Manifest</h1>'
            ."<p>Reference: {$ref} | State: {$state} | IPC: {$ipcId} | Revision: {$data['revision']} | Material Version: {$data['material_version']}</p>"
            ."<table><thead><tr><th>IPC Line</th><th>Accepted</th><th>Damaged</th><th>Rejected</th><th>Accepted Value (PHP)</th></tr></thead><tbody>{$linesHtml}</tbody></table>"
            .'<p>Printing does not post physical stock.</p></body></html>';

        return $this->printResponse($html);
    }

    /**
     * Evaluate whether the IPC has at least two distinct completed counters for the current material version,
     * with at least one outside the union of recorded regular custodians.
     */
    public function hasIndependentCompletedCounts(OpeningCount $ipc): bool
    {
        $material = $this->normalizedIpcMaterial($ipc);
        $custodians = $this->recordedCustodians($ipc->chapter_id, $material['lines']);
        $completed = array_values(array_filter(
            (array) ($ipc->counts_json ?? []),
            fn (array $count) => ($count['completed'] ?? false) === true
                && (int) ($count['material_version'] ?? 0) === (int) $ipc->material_version
        ));
        if (count($completed) < 2) {
            return false;
        }
        foreach ($completed as $count) {
            if (! in_array($count['actor_id'], $custodians, true)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  callable(string): array<string, mixed>  $execute
     * @param  ?callable(): void  $verifyReplayTarget
     */
    private function runIdempotentWrite(
        string $chapterId,
        string $actor,
        string $operation,
        string $key,
        ?string $targetId,
        array $payload,
        int $status,
        callable $execute,
        ?callable $verifyReplayTarget = null,
    ): JsonResponse {
        $scope = ['chapter_id' => $chapterId, 'user_id' => $actor, 'operation' => $operation, 'key' => $key];
        $fingerprint = CanonicalJson::sha256(['target_id' => $targetId, 'payload' => $payload]);

        $existing = ActionReceipt::where($scope)->sharedLock()->first();
        if ($existing) {
            if (! hash_equals($existing->fingerprint, $fingerprint)) {
                throw new ContractException(409, 'action_key_conflict', 'Use a new action key for changed input.');
            }
            if ($verifyReplayTarget !== null) {
                $verifyReplayTarget();
            }

            return response()->json($existing->result, $existing->status, ['X-Action-Replayed' => 'true']);
        }

        $operationId = (string) Str::uuid();
        $receipt = null;
        $wasReplayed = false;
        try {
            DB::transaction(function () use ($scope, $fingerprint, $status, $operationId, $execute, &$receipt, &$wasReplayed): void {
                $result = $execute($operationId);
                $recorded = ActionReceipt::record($scope, $fingerprint, $status, $result, $operationId);
                $receipt = $recorded;
                if (! $recorded->wasRecentlyCreated) {
                    $wasReplayed = true;
                    // Roll back duplicate savepoint writes and return the already-committed receipt.
                    throw new \RuntimeException('__opening_replay__');
                }
            });
        } catch (\RuntimeException $e) {
            if ($e->getMessage() !== '__opening_replay__' || ! $receipt) {
                throw $e;
            }
            if ($verifyReplayTarget !== null) {
                $verifyReplayTarget();
            }
        }

        return response()->json($receipt->result, $receipt->status, [
            'X-Action-Replayed' => $wasReplayed ? 'true' : 'false',
        ]);
    }

    /** @return array<string, mixed> */
    private function validateIpcMaterial(ChapterAuthority $authority, string $chapterId, ?string $ipcId, array $material): array
    {
        $policiesByKey = [];
        $blockers = [];
        foreach ($material['policies'] as $binding) {
            $key = $binding['setting_key'];
            if (isset($policiesByKey[$key])) {
                throw new ContractException(409, 'invalid_source', "Duplicate policy binding for {$key}.");
            }
            [$owner, $schema] = self::POLICY_RULES[$key];
            $policy = PolicyRecord::where('chapter_id', $chapterId)
                ->where('policy_code', $key)
                ->where('policy_version', $binding['version'])
                ->where(fn ($q) => $q->where('aggregate_id', $binding['policy_id'])->orWhere('id', $binding['policy_id']))
                ->sharedLock()
                ->first();

            if (! $policy) {
                $blockers[] = ChapterAuthority::setupBlocker($key, $owner, 'missing');

                continue;
            }
            $state = $this->openingPolicyState($policy, $owner, $schema, $key === 'ipc_authorization' ? $ipcId : null);
            if ($state !== 'effective') {
                $blockers[] = ChapterAuthority::setupBlocker($key, $owner, $state ?? 'unapproved');

                continue;
            }
            $policiesByKey[$key] = $policy;
        }
        if ($blockers !== []) {
            throw new ContractException(428, 'setup_blocked', 'Required chapter setup is not currently effective.', [
                'error' => [
                    'code' => 'setup_blocked',
                    'message' => 'Required chapter setup is not currently effective.',
                    'blockers' => $blockers,
                ],
            ]);
        }

        if (isset($policiesByKey['ipc_authorization'])) {
            $authRules = $policiesByKey['ipc_authorization']->rules_json ?? [];
            if ($material['cutoff_at'] !== null && isset($authRules['cutoff_at']) && $material['cutoff_at'] !== $authRules['cutoff_at']) {
                throw new ContractException(409, 'invalid_source', 'Cutoff timestamp does not match the pinned IPC authorization policy.');
            }
            $allowedTeam = $authRules['count_team_ids'] ?? [];
            foreach ($material['count_team'] as $member) {
                if (! in_array($member['user_id'], $allowedTeam, true)) {
                    throw new ContractException(409, 'invalid_source', 'Count team member is not authorized by the pinned IPC authorization policy.');
                }
            }
        }

        $lineIds = [];
        $recordedCustodians = [];
        $lines = [];
        foreach ($material['lines'] as $line) {
            if (isset($lineIds[$line['line_id']])) {
                throw new ContractException(409, 'invalid_source', 'Duplicate IPC line_id.');
            }
            $lineIds[$line['line_id']] = true;

            $item = CatalogueItem::where('chapter_id', $chapterId)->whereKey($line['item_id'])->sharedLock()->first();
            $variant = CatalogueVariant::where('chapter_id', $chapterId)->whereKey($line['variant_id'])->sharedLock()->first();
            $unit = CatalogueUnit::where('chapter_id', $chapterId)->whereKey($line['unit_id'])->sharedLock()->first();
            $location = CatalogueLocation::where('chapter_id', $chapterId)->whereKey($line['location_id'])->sharedLock()->first();

            if (! $item || ! $variant || ! $unit || ! $location
                || $variant->item_id !== $item->id
                || ($variant->unit_id !== null && $variant->unit_id !== $unit->id)
                || (int) $variant->material_version !== $line['variant_material_version']
                || (int) $unit->material_version !== $line['unit_material_version']
                || (int) $location->material_version !== $line['location_material_version']
                || (int) $unit->quantity_scale !== $line['quantity_scale']
                || ($variant->quantity_scale !== null && (int) $variant->quantity_scale !== $line['quantity_scale'])) {
                throw new ContractException(409, 'invalid_source', 'Line catalogue identity, unit scale, or material version is invalid.');
            }

            if ($line['counted_quantity'] !== null && ! $this->fitsScale($line['counted_quantity'], $line['quantity_scale'])) {
                throw new ContractException(409, 'invalid_source', 'Counted quantity exceeds the approved unit scale.');
            }

            $custodianIds = $line['regular_custodian_ids'];
            if (count(array_unique($custodianIds)) !== count($custodianIds)) {
                throw new ContractException(409, 'invalid_source', 'Duplicate custodian in regular_custodian_ids.');
            }
            if ($location->custodian_id !== null && ! in_array($location->custodian_id, $custodianIds, true)) {
                throw new ContractException(409, 'invalid_source', 'Line regular_custodian_ids must include the location recorded custodian.');
            }
            foreach ($custodianIds as $cid) {
                if (! $this->isChapterMember($chapterId, $cid)) {
                    throw new ContractException(409, 'invalid_source', 'Regular custodian is not an active chapter member.');
                }
                $recordedCustodians[$cid] = true;
            }
            if ($location->custodian_id !== null) {
                $recordedCustodians[$location->custodian_id] = true;
            }

            sort($custodianIds);
            $line['regular_custodian_ids'] = $custodianIds;
            $lines[] = $line;
        }

        $teamSeen = [];
        $team = [];
        foreach ($material['count_team'] as $member) {
            $uid = $member['user_id'];
            if (isset($teamSeen[$uid])) {
                throw new ContractException(409, 'invalid_source', 'Duplicate count_team member.');
            }
            if (! $this->isChapterMember($chapterId, $uid)) {
                throw new ContractException(409, 'invalid_source', 'Count team member is not an active chapter member.');
            }
            $teamSeen[$uid] = true;
            // Recorded custody always governs; callers cannot clear regular_custodian for a recorded custodian.
            $team[] = [
                'user_id' => $uid,
                'regular_custodian' => isset($recordedCustodians[$uid]) || $member['regular_custodian'],
            ];
        }

        usort($team, fn (array $a, array $b) => strcmp($a['user_id'], $b['user_id']));
        $policies = $material['policies'];
        usort($policies, fn (array $a, array $b) => strcmp($a['setting_key'], $b['setting_key']));
        usort($lines, fn (array $a, array $b) => strcmp($a['line_id'], $b['line_id']));

        return [
            'cutoff_at' => $material['cutoff_at'],
            'informal_movements_suspended' => $material['informal_movements_suspended'],
            'count_team' => $team,
            'policies' => $policies,
            'lines' => $lines,
            'notes' => $material['notes'],
        ];
    }

    /** @return array<string, mixed> */
    private function validateRmMaterial(OpeningCount $ipc, array $material): array
    {
        if ($material['ipc_material_version'] !== (int) $ipc->material_version) {
            throw new ContractException(409, 'snapshot_stale', 'Opening RM material must reference the current IPC material version.');
        }

        $ipcMaterial = $this->normalizedIpcMaterial($ipc);
        $ipcLines = [];
        foreach ($ipcMaterial['lines'] as $line) {
            $ipcLines[$line['line_id']] = $line;
        }

        $seen = [];
        $lines = [];
        foreach ($material['lines'] as $line) {
            $lineId = $line['ipc_line_id'];
            if (isset($seen[$lineId]) || ! isset($ipcLines[$lineId])) {
                throw new ContractException(409, 'invalid_source', 'Opening RM line must reference a unique existing IPC line.');
            }
            $seen[$lineId] = true;
            $scale = (int) $ipcLines[$lineId]['quantity_scale'];
            foreach (['accepted_quantity', 'damaged_quantity', 'rejected_quantity'] as $qtyField) {
                if ($line[$qtyField] !== null && ! $this->fitsScale($line[$qtyField], $scale)) {
                    throw new ContractException(409, 'invalid_source', 'Opening RM quantity exceeds the approved unit scale.');
                }
            }
            $lines[] = $line;
        }

        usort($lines, fn (array $a, array $b) => strcmp($a['ipc_line_id'], $b['ipc_line_id']));

        return [
            'ipc_material_version' => $material['ipc_material_version'],
            'lines' => $lines,
            'notes' => $material['notes'],
        ];
    }

    private function invalidateDependentRms(string $chapterId, string $ipcId, string $actor, string $key, CarbonInterface $now): void
    {
        $rms = OpeningRm::where('chapter_id', $chapterId)
            ->where('ipc_id', $ipcId)
            ->whereNotIn('status', ['posted', 'POSTED'])
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        foreach ($rms as $rm) {
            $needsReset = self::rmState($rm) !== 'draft'
                || $rm->inspection_data !== null
                || $rm->snapshot_data !== null
                || $rm->snapshot_sha256 !== null
                || $rm->acknowledgment_json !== null;
            if (! $needsReset) {
                continue;
            }
            $rm->status = 'draft';
            $rm->inspector_user_id = null;
            $rm->evidence_binding_id = null;
            $rm->inspection_data = null;
            $rm->snapshot_data = null;
            $rm->snapshot_sha256 = null;
            $rm->acknowledgment_json = null;
            $rm->revision = (int) $rm->revision + 1;
            $rm->updated_at = $now;
            $rm->save();

            $snapshot = $this->formatRm($rm);
            $op = $this->operationReceipt((string) Str::uuid(), 'replaceIpc', $key, $actor, $chapterId, 'opening_rm', $rm->id, (int) $rm->revision, (int) $rm->material_version, 200, $now);
            $this->recordHistoryAndOutbox('OPENING_RM', $rm->id, $chapterId, (int) $rm->revision, (int) $rm->material_version, 'invalidated_by_source', $actor, $snapshot, $op, 'IPC material replaced', 'stage1.opening-rm.changed.v1');
        }
    }

    /** @return list<string> */
    private function recordedCustodians(string $chapterId, array $lines): array
    {
        $ids = [];
        $locationIds = array_values(array_unique(array_column($lines, 'location_id')));
        $locations = $locationIds === []
            ? collect()
            : CatalogueLocation::where('chapter_id', $chapterId)->whereIn('id', $locationIds)->sharedLock()->get()->keyBy('id');

        foreach ($lines as $line) {
            foreach ($line['regular_custodian_ids'] ?? [] as $cid) {
                $ids[$cid] = true;
            }
            $loc = $locations->get($line['location_id'] ?? '');
            if ($loc && $loc->custodian_id) {
                $ids[$loc->custodian_id] = true;
            }
        }

        return array_keys($ids);
    }

    private function openingPolicyState(PolicyRecord $policy, string $owner, string $schema, ?string $allowedSubjectId): ?string
    {
        $evidence = $policy->setupEvidence();
        $subject = $evidence['subject_id'] ?? null;
        if ($subject !== null && ($allowedSubjectId === null || $subject !== $allowedSubjectId)) {
            return null;
        }
        if (isset($evidence['value_schema_reference']) && $evidence['value_schema_reference'] !== '#/components/schemas/'.$schema) {
            return null;
        }
        if (! isset($evidence['value_schema_reference']) || ! collect($evidence['approvals'] ?? [])->contains('authority', $owner)) {
            return 'unapproved';
        }
        if (! $policy->effective_from || $policy->effective_from->isFuture()) {
            return 'not_effective';
        }

        return $policy->effective_until && ! $policy->effective_until->isFuture() ? 'expired' : 'effective';
    }

    private function listHistory(
        Request $request,
        string $chapterId,
        string $recordType,
        string $recordId,
        int $snapshotVersion,
        int $limit,
        ?string $cursor,
    ): JsonResponse {
        $rows = OpeningRecordHistory::where('chapter_id', $chapterId)
            ->where('record_type', $recordType)
            ->where('record_id', $recordId)
            ->orderBy('revision')
            ->sharedLock()
            ->get();

        $items = $rows->map(fn (OpeningRecordHistory $row) => [
            'operation' => $row->operation_json ?? $this->fallbackOperation($row),
            'reason' => $row->reason,
        ])->all();

        return $this->paginatedResponse(
            $request,
            $chapterId,
            $recordType === 'IPC' ? 'listIpcHistory' : 'listOpeningRmHistory',
            ['record_id' => $recordId],
            $limit,
            $cursor,
            $items,
            max(1, $snapshotVersion),
        );
    }

    /** @return array<string, mixed> */
    private function relatedPayload(ChapterAuthority $authority, string $chapterId, OpeningCount $ipc, ?OpeningRm $rm = null): array
    {
        $rms = OpeningRm::where('chapter_id', $chapterId)
            ->where('ipc_id', $ipc->id)
            ->orderBy('id')
            ->sharedLock()
            ->get();

        $rmIds = $authority->allows('opening_rm.read') ? $rms->pluck('id')->all() : [];
        $evidence = [];
        if ($authority->allows('evidence.read')) {
            $seen = [];
            if (is_array($ipc->signed_ipc_json)) {
                $k = ($ipc->signed_ipc_json['evidence_id'] ?? '').':'.($ipc->signed_ipc_json['version_id'] ?? '');
                $seen[$k] = true;
                $evidence[] = $ipc->signed_ipc_json;
            }
            $targetRmIds = $rm ? [$rm->id] : $rms->pluck('id')->all();
            if ($targetRmIds !== []) {
                $records = EvidenceRecord::where('chapter_id', $chapterId)
                    ->where('purpose', 'opening_receipt')
                    ->whereIn('record_id', $targetRmIds)
                    ->orderBy('id')
                    ->sharedLock()
                    ->get();
                foreach ($records as $ev) {
                    $latestVersion = $ev->blobs()->max('version');
                    if ($latestVersion === null) {
                        continue;
                    }
                    $blobs = $ev->blobs()->where('version', $latestVersion)
                        ->orderByRaw('position IS NULL')->orderBy('position')->orderBy('id')->get();
                    if ($blobs->isEmpty()) {
                        continue;
                    }
                    $versionId = $blobs->first()->version_id ?? $blobs->first()->id;
                    $k = $ev->id.':'.$versionId;
                    if (isset($seen[$k])) {
                        continue;
                    }
                    $seen[$k] = true;
                    $evidence[] = [
                        'evidence_id' => $ev->id,
                        'version_id' => $versionId,
                        'attachments' => $blobs->map(fn (EvidenceBlob $b) => [
                            'attachment_id' => $b->id,
                            'sha256' => $b->sha256_hash,
                        ])->values()->all(),
                    ];
                }
            }
        }

        $postedRm = $rm && self::rmState($rm) === 'posted'
            ? $rm
            : $rms->first(fn (OpeningRm $candidate) => self::rmState($candidate) === 'posted');

        $movementIds = [];
        $findingIds = [];
        if ($postedRm && $authority->allows('stock.read')) {
            $movementIds = InventoryMovement::where('chapter_id', $chapterId)
                ->whereHas('posting', fn ($q) => $q->where('source_id', $postedRm->id))
                ->orderBy('created_at')->orderBy('id')->pluck('id')->all();
            $findingIds = InventoryLot::where('chapter_id', $chapterId)
                ->where('source_id', $postedRm->id)
                ->whereIn('condition', ['QUARANTINE', 'REJECTED'])
                ->orderBy('created_at')->orderBy('id')->pluck('id')->all();
        }

        return [
            'ipc_id' => $ipc->id,
            'rm_ids' => $rmIds,
            'evidence' => $evidence,
            'movement_ids' => $movementIds,
            'finding_ids' => $findingIds,
            'outcome_id' => $postedRm?->outcome_id,
        ];
    }

    private function paginatedResponse(
        Request $request,
        string $chapterId,
        string $scope,
        array $filters,
        int $limit,
        ?string $rawCursor,
        array $items,
        int $snapshotVersion,
    ): JsonResponse {
        $authority = $this->authority($request);
        $userId = $request->user()->id;
        $snapshotHash = hash('sha256', CanonicalJson::encode([$snapshotVersion, $items]));
        $offset = 0;
        $expires = now('UTC')->addMinutes(5)->timestamp;

        if ($rawCursor !== null) {
            if (strlen($rawCursor) > 1024) {
                throw new ContractException(400, 'invalid_selector', 'Invalid cursor.');
            }
            try {
                $decoded = json_decode(Crypt::decryptString($rawCursor), true, flags: JSON_THROW_ON_ERROR);
            } catch (DecryptException|\JsonException) {
                throw new ContractException(400, 'invalid_selector', 'Invalid cursor.');
            }
            if (($decoded['scope'] ?? null) !== $scope
                || ($decoded['user'] ?? null) !== $userId
                || ($decoded['chapter'] ?? null) !== $chapterId
                || ($decoded['limit'] ?? null) !== $limit
                || ($decoded['filters'] ?? null) !== $filters) {
                throw new ContractException(400, 'invalid_selector', 'Cursor does not match request selectors.');
            }
            if (($decoded['expires'] ?? 0) <= now('UTC')->timestamp
                || ($decoded['authority_version'] ?? null) !== $authority->version
                || ($decoded['snapshot'] ?? null) !== $snapshotHash) {
                throw new ContractException(409, 'snapshot_stale', 'List snapshot is stale; restart pagination.');
            }
            $offset = (int) $decoded['offset'];
            $expires = (int) $decoded['expires'];
        }

        $slice = array_slice($items, $offset, $limit);
        $nextCursor = $offset + $limit < count($items)
            ? Crypt::encryptString(json_encode([
                'scope' => $scope,
                'user' => $userId,
                'chapter' => $chapterId,
                'authority_version' => $authority->version,
                'filters' => $filters,
                'limit' => $limit,
                'snapshot' => $snapshotHash,
                'offset' => $offset + $limit,
                'expires' => $expires,
            ], JSON_THROW_ON_ERROR))
            : null;

        return response()->json([
            'data' => $slice,
            'page' => [
                'next_cursor' => $nextCursor,
                'snapshot_version' => max(1, $snapshotVersion),
            ],
        ]);
    }

    private function formatIpc(OpeningCount $ipc): array
    {
        return [
            'id' => $ipc->id,
            'chapter_id' => $ipc->chapter_id,
            'reference' => $ipc->ipc_number,
            'revision' => (int) $ipc->revision,
            'material_version' => (int) $ipc->material_version,
            'state' => self::ipcState($ipc),
            'prepared_by' => $ipc->created_by,
            'created_at' => $this->instant($ipc->created_at),
            'updated_at' => $this->instant($ipc->updated_at),
            'material' => $this->normalizedIpcMaterial($ipc),
            'counts' => array_values((array) ($ipc->counts_json ?? [])),
            'signed_ipc' => $ipc->signed_ipc_json,
            'authorizations' => array_values((array) ($ipc->authorizations_json ?? [])),
            'posted_rm_id' => $ipc->posted_rm_id,
        ];
    }

    private function formatRm(OpeningRm $rm): array
    {
        $material = is_array($rm->material_json) ? $rm->material_json : [
            'ipc_material_version' => 1,
            'lines' => [],
            'notes' => $rm->notes,
        ];

        return [
            'id' => $rm->id,
            'chapter_id' => $rm->chapter_id,
            'reference' => $rm->rm_number,
            'ipc_id' => $rm->ipc_id,
            'revision' => (int) $rm->revision,
            'material_version' => (int) $rm->material_version,
            'state' => self::rmState($rm),
            'prepared_by' => $rm->prepared_by ?? $rm->inspector_user_id ?? $rm->ipc?->created_by,
            'created_at' => $this->instant($rm->created_at),
            'updated_at' => $this->instant($rm->updated_at),
            'material' => $material,
            'inspection' => $rm->inspection_data,
            'snapshot' => $rm->snapshot_data,
            'snapshot_sha256' => $rm->snapshot_sha256,
            'acknowledgment' => $rm->acknowledgment_json,
            'posted_at' => $rm->posted_at ? $this->instant($rm->posted_at) : null,
            'outcome_id' => $rm->outcome_id,
        ];
    }

    /** @return array<string, mixed> */
    private function normalizedIpcMaterial(OpeningCount $ipc): array
    {
        if (is_array($ipc->material_json)) {
            return $ipc->material_json;
        }

        return [
            'cutoff_at' => null,
            'informal_movements_suspended' => false,
            'count_team' => [],
            'policies' => [],
            'lines' => [],
            'notes' => $ipc->notes,
        ];
    }

    /** @return array<string, mixed> */
    private function operationReceipt(
        string $id,
        string $operation,
        string $actionKey,
        string $actorId,
        string $chapterId,
        string $recordKind,
        string $recordId,
        int $revision,
        int $materialVersion,
        int $httpStatus,
        CarbonInterface $committedAt,
    ): array {
        return [
            'id' => $id,
            'operation' => $operation,
            'action_key' => $actionKey,
            'actor_id' => $actorId,
            'chapter_id' => $chapterId,
            'record_kind' => $recordKind,
            'record_id' => $recordId,
            'record_revision' => $revision,
            'material_version' => $materialVersion,
            'http_status' => $httpStatus,
            'committed_at' => $committedAt->utc()->format('Y-m-d\TH:i:s.u\Z'),
        ];
    }

    /** @return array<string, mixed> */
    private function fallbackOperation(OpeningRecordHistory $row): array
    {
        $op = match ($row->record_type.':'.$row->event_type) {
            'IPC:created' => 'createIpc',
            'IPC:replaced' => 'replaceIpc',
            'IPC:count_saved' => 'saveMyIpcCount',
            'IPC:submitted' => 'submitIpc',
            'IPC:authorized' => 'authorizeIpc',
            'OPENING_RM:created' => 'createOpeningRm',
            'OPENING_RM:replaced' => 'replaceOpeningRm',
            'OPENING_RM:inspected' => 'inspectOpeningRm',
            'OPENING_RM:evidence_matched' => 'matchOpeningRmEvidence',
            default => 'postOpeningRm',
        };

        return $this->operationReceipt(
            $row->id,
            $op,
            $row->id,
            $row->actor_user_id ?? (string) Str::uuid(),
            $row->chapter_id,
            $row->record_type === 'IPC' ? 'ipc' : 'opening_rm',
            $row->record_id,
            (int) $row->revision,
            (int) $row->material_version,
            $row->event_type === 'created' ? 201 : 200,
            CarbonImmutable::instance($row->created_at ?? now('UTC')),
        );
    }

    private function recordHistoryAndOutbox(
        string $recordType,
        string $recordId,
        string $chapterId,
        int $revision,
        int $materialVersion,
        string $eventType,
        string $actorId,
        array $snapshot,
        array $operation,
        ?string $reason,
        string $outboxEvent,
    ): void {
        OpeningRecordHistory::create([
            'id' => (string) Str::uuid(),
            'chapter_id' => $chapterId,
            'record_type' => $recordType,
            'record_id' => $recordId,
            'revision' => $revision,
            'material_version' => $materialVersion,
            'event_type' => $eventType,
            'actor_user_id' => $actorId,
            'snapshot_json' => $snapshot,
            'operation_json' => $operation,
            'reason' => $reason,
            'created_at' => now('UTC'),
        ]);

        AuditLog::create([
            'chapter_id' => $chapterId,
            'user_id' => $actorId,
            'action' => $operation['operation'],
            'entity_type' => strtolower($recordType),
            'entity_id' => $recordId,
            'details' => [
                'operation_id' => $operation['id'],
                'revision' => $revision,
                'material_version' => $materialVersion,
            ],
        ]);

        $this->outbox->recordIntent($outboxEvent, $chapterId, $recordId, $revision, $materialVersion);
    }

    private function findIpc(string $chapterId, string $ipcId, bool $lock): OpeningCount
    {
        $query = OpeningCount::where('chapter_id', $chapterId)->whereKey($ipcId);
        $ipc = ($lock ? $query->lockForUpdate() : $query->sharedLock())->first();
        if (! $ipc) {
            throw new ContractException(404, 'resource_not_found', 'Resource not found.');
        }

        return $ipc;
    }

    private function findRm(string $chapterId, string $rmId, bool $lock): OpeningRm
    {
        $query = OpeningRm::where('chapter_id', $chapterId)->whereKey($rmId);
        $rm = ($lock ? $query->lockForUpdate() : $query->sharedLock())->first();
        if (! $rm) {
            throw new ContractException(404, 'resource_not_found', 'Resource not found.');
        }

        return $rm;
    }

    private function assertBaselineNotPosted(string $chapterId): void
    {
        $posted = OpeningRm::where('chapter_id', $chapterId)
            ->whereIn('status', ['posted', 'POSTED'])
            ->sharedLock()
            ->exists();
        if ($posted) {
            throw new ContractException(409, 'baseline_already_posted', 'An opening baseline has already been posted for this chapter.');
        }
    }

    private function isChapterMember(string $chapterId, string $userId): bool
    {
        return ChapterMembership::where('chapter_id', $chapterId)
            ->where('user_id', $userId)
            ->current()
            ->sharedLock()
            ->exists();
    }

    private function fitsScale(string $quantity, int $scale): bool
    {
        $fraction = explode('.', $quantity, 2)[1] ?? '';

        return strlen($fraction) <= $scale;
    }

    private function parseLimit(?string $raw): int
    {
        if ($raw === null) {
            return 25;
        }
        $limit = filter_var($raw, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100]]);
        if ($limit === false) {
            throw new ContractException(400, 'invalid_selector', 'Invalid limit selector.');
        }

        return (int) $limit;
    }

    private function authority(Request $request): ChapterAuthority
    {
        return $request->attributes->get(ChapterAuthority::class);
    }

    private function instant(mixed $ts): string
    {
        return CarbonImmutable::instance($ts ?? now('UTC'))->utc()->format('Y-m-d\TH:i:s.u\Z');
    }

    private function printResponse(string $html): Response
    {
        return new Response($html, 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Cache-Control' => 'no-store',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => self::PRINT_CSP,
        ]);
    }

    public static function ipcState(OpeningCount $ipc): string
    {
        return match (strtolower((string) $ipc->status)) {
            'awaiting_authorization' => 'awaiting_authorization',
            'authorized' => 'authorized',
            'posted' => 'posted',
            default => 'draft',
        };
    }

    public static function rmState(OpeningRm $rm): string
    {
        return match (strtolower((string) $rm->status)) {
            'inspected' => 'inspected',
            'matched', 'evidence_matched' => 'matched',
            'posted' => 'posted',
            default => 'draft',
        };
    }
}
