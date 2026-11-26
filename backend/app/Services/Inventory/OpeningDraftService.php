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
use App\Models\Chapter;
use App\Models\ChapterMembership;
use App\Models\EvidenceBinding;
use App\Models\EvidenceBlob;
use App\Models\EvidenceRecord;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\OpeningCount;
use App\Models\OpeningRecordHistory;
use App\Models\OpeningRm;
use App\Models\PolicyRecord;
use App\Models\User;
use App\Services\Authority\ChapterAuthority;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\CanonicalJson;
use App\Services\Shared\ReferenceSequenceService;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
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

    private const MAX_PHP_VALUE = '999999999999.99';

    public function __construct(
        private readonly DomainNotificationOutboxService $outbox,
        private readonly CheckEvidenceBindingParticipant $checkEvidenceBinding,
        private readonly ReferenceSequenceService $referenceSequences,
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
                if ($signedAt && ! $countedAt) {
                    throw new ContractException(409, 'invalid_source', 'Signature timestamp requires a count timestamp.');
                }
                if ($cutoffAt && (($countedAt && $countedAt->lt($cutoffAt)) || ($signedAt && $signedAt->lt($cutoffAt)))) {
                    throw new ContractException(409, 'invalid_source', 'Count and signature timestamps cannot precede cutoff.');
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

    public function submitIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        OpeningDraftInput::requireUuid($ipcId, 'ipc_id');
        [$key, $payload] = OpeningDraftInput::parseWrite($request, [OpeningDraftInput::class, 'validateSubmitIpc']);
        $actor = $request->user()->id;
        $authority = $this->authority($request);

        return $this->runIdempotentWrite(
            $chapterId,
            $actor,
            'submitIpc',
            $key,
            $ipcId,
            $payload,
            200,
            function (string $operationId) use ($chapterId, $ipcId, $actor, $authority, $key, $payload): array {
                $ipc = $this->findIpc($chapterId, $ipcId, lock: true);
                $state = self::ipcState($ipc);
                if ($state === 'posted') {
                    throw new ContractException(409, 'target_locked', 'Posted IPC cannot be submitted.');
                }
                if ($state !== 'draft') {
                    throw new ContractException(409, 'invalid_transition', 'Only draft IPCs can be submitted.');
                }
                $this->assertBaselineNotPosted($chapterId);
                if ((int) $ipc->revision !== $payload['expected_revision']) {
                    throw new ContractException(409, 'version_conflict', 'IPC revision is stale.');
                }
                if ((int) $ipc->material_version !== $payload['material_version']) {
                    throw new ContractException(409, 'snapshot_stale', 'IPC material version is stale.');
                }

                $material = $this->normalizedIpcMaterial($ipc);
                $policies = $this->resolvePolicies($authority, $chapterId, $ipc->id, $material, requireAll: true);
                $custodians = $this->assertCompleteIpcMaterial($chapterId, $material);
                $now = now('UTC');
                $this->assertIndependentAgreedCounts($chapterId, $ipc, $material, $custodians, $now);
                $signedIpc = $this->verifyOpeningEvidenceBytes($chapterId, $payload['signed_ipc'], $ipc->id);

                if ($ipc->ipc_number === null) {
                    $refRules = $policies['reference_series']->rules_json ?? [];
                    $seq = $this->referenceSequences->nextReference($chapterId, 'IPC', policyOverride: [
                        'prefix' => rtrim((string) ($refRules['ipc_prefix'] ?? 'IPC'), '-'),
                        'width' => (int) ($refRules['minimum_digits'] ?? 6),
                        'policy_id' => $policies['reference_series']->aggregate_id ?? $policies['reference_series']->id,
                        'policy_version' => (int) $policies['reference_series']->policy_version,
                    ]);
                    $ipc->ipc_number = $seq['reference'];
                }

                $ipc->status = 'awaiting_authorization';
                $ipc->signed_ipc_json = $signedIpc;
                $ipc->authorizations_json = [];
                $ipc->authorized_head_by = null;
                $ipc->authorized_finance_by = null;
                $ipc->authorized_at = null;
                $ipc->authorized_head_signature = null;
                $ipc->authorized_finance_signature = null;
                $ipc->submitted_at = $now;
                $ipc->revision = (int) $ipc->revision + 1;
                $ipc->updated_at = $now;
                $ipc->save();

                $record = $this->formatIpc($ipc);
                $operation = $this->operationReceipt($operationId, 'submitIpc', $key, $actor, $chapterId, 'ipc', $ipc->id, (int) $ipc->revision, (int) $ipc->material_version, 200, $now);
                $this->recordHistoryAndOutbox('IPC', $ipc->id, $chapterId, (int) $ipc->revision, (int) $ipc->material_version, 'submitted', $actor, $record, $operation, null, 'stage1.ipc.changed.v1');

                return ['data' => ['operation' => $operation, 'record' => $record, 'posting' => null]];
            },
            verifyReplayTarget: fn () => $this->findIpc($chapterId, $ipcId, lock: false),
        );
    }

    public function authorizeIpc(Request $request, string $chapterId, string $ipcId): JsonResponse
    {
        OpeningDraftInput::requireUuid($ipcId, 'ipc_id');
        [$key, $payload] = OpeningDraftInput::parseWrite($request, [OpeningDraftInput::class, 'validateAuthorizeIpc']);
        $actor = $request->user()->id;
        $authority = $this->authority($request);

        if (! $authority->allowsDuty($payload['duty'], decisionScope: 'ipc_authorization:'.$ipcId)) {
            throw new ContractException(403, 'duty_denied', 'Current duty does not permit this authorization.');
        }

        return $this->runIdempotentWrite(
            $chapterId,
            $actor,
            'authorizeIpc',
            $key,
            $ipcId,
            $payload,
            200,
            function (string $operationId) use ($chapterId, $ipcId, $actor, $authority, $key, $payload): array {
                $ipc = $this->findIpc($chapterId, $ipcId, lock: true);
                $state = self::ipcState($ipc);
                if ($state === 'posted') {
                    throw new ContractException(409, 'target_locked', 'Posted IPC cannot be authorized.');
                }
                if ($state !== 'awaiting_authorization') {
                    throw new ContractException(409, 'invalid_transition', 'The IPC cannot be authorized in its current state.');
                }
                $this->assertBaselineNotPosted($chapterId);
                if ((int) $ipc->revision !== $payload['expected_revision']) {
                    throw new ContractException(409, 'version_conflict', 'IPC revision is stale.');
                }
                if ((int) $ipc->material_version !== $payload['material_version']) {
                    throw new ContractException(409, 'snapshot_stale', 'IPC material version is stale.');
                }

                $authorizations = array_values((array) ($ipc->authorizations_json ?? []));
                foreach ($authorizations as $existing) {
                    if (($existing['duty'] ?? null) === $payload['duty']
                        && (int) ($existing['material_version'] ?? 0) === (int) $ipc->material_version) {
                        throw new ContractException(409, 'invalid_transition', 'This authorization slot is already filled.');
                    }
                }

                $material = $this->normalizedIpcMaterial($ipc);
                $policies = $this->resolvePolicies($authority, $chapterId, $ipc->id, $material, requireAll: true);
                $custodians = $this->assertCompleteIpcMaterial($chapterId, $material);
                $roundingMode = (string) ($policies['valuation_rounding']->rules_json['rounding_mode'] ?? '');
                $ipcTotalPhp = $this->ipcTotalValuation($material['lines'], $roundingMode);
                if (! $authority->allowsDuty($payload['duty'], decisionScope: 'ipc_authorization:'.$ipcId, amount: $ipcTotalPhp)) {
                    throw new ContractException(403, 'duty_denied', 'Current duty monetary limit does not permit this authorization.');
                }

                $now = now('UTC');
                $completedCounts = $this->assertIndependentAgreedCounts($chapterId, $ipc, $material, $custodians, $now);

                if (! is_array($ipc->signed_ipc_json)) {
                    throw new ContractException(409, 'evidence_missing', 'Submitted IPC is missing its signed paper binding.');
                }
                $signedIpc = $this->verifyOpeningEvidenceBytes($chapterId, $ipc->signed_ipc_json, $ipc->id);

                $signedAt = CarbonImmutable::parse($payload['signed_at'], 'UTC');
                if ($signedAt->gt($now)) {
                    throw new ContractException(409, 'invalid_source', 'Authorization signature timestamp cannot be in the future.');
                }
                if ($material['cutoff_at'] !== null && $signedAt->lt(CarbonImmutable::parse($material['cutoff_at'], 'UTC'))) {
                    throw new ContractException(409, 'invalid_source', 'Authorization signature timestamp cannot precede cutoff.');
                }
                foreach ($completedCounts as $count) {
                    if ($signedAt->lt(CarbonImmutable::parse($count['signed_at'], 'UTC'))) {
                        throw new ContractException(409, 'invalid_source', 'Authorization signature timestamp cannot precede completed count signatures.');
                    }
                }

                $authorizations[] = [
                    'id' => (string) Str::uuid(),
                    'actor_id' => $actor,
                    'duty' => $payload['duty'],
                    'material_version' => (int) $ipc->material_version,
                    'authorized_at' => $now->format('Y-m-d\TH:i:s.u\Z'),
                    'signed_at' => $payload['signed_at'],
                    'signed_ipc' => $signedIpc,
                ];
                usort($authorizations, fn (array $a, array $b) => ($a['duty'] === 'CHAPTER_HEAD' ? 0 : 1) <=> ($b['duty'] === 'CHAPTER_HEAD' ? 0 : 1));

                if ($payload['duty'] === 'CHAPTER_HEAD') {
                    $ipc->authorized_head_by = $actor;
                    $ipc->authorized_head_signature = $payload['signed_at'];
                } else {
                    $ipc->authorized_finance_by = $actor;
                    $ipc->authorized_finance_signature = $payload['signed_at'];
                }

                $duties = array_column($authorizations, 'duty');
                if (in_array('CHAPTER_HEAD', $duties, true) && in_array('FINANCE', $duties, true)) {
                    $ipc->status = 'authorized';
                    $ipc->authorized_at = $now;
                }

                $ipc->authorizations_json = $authorizations;
                $ipc->revision = (int) $ipc->revision + 1;
                $ipc->updated_at = $now;
                $ipc->save();

                $record = $this->formatIpc($ipc);
                $operation = $this->operationReceipt($operationId, 'authorizeIpc', $key, $actor, $chapterId, 'ipc', $ipc->id, (int) $ipc->revision, (int) $ipc->material_version, 200, $now);
                $this->recordHistoryAndOutbox('IPC', $ipc->id, $chapterId, (int) $ipc->revision, (int) $ipc->material_version, 'authorized', $actor, $record, $operation, null, 'stage1.ipc.changed.v1');

                return ['data' => ['operation' => $operation, 'record' => $record, 'posting' => null]];
            },
            verifyReplayTarget: fn () => $this->findIpc($chapterId, $ipcId, lock: false),
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
        $preparedBy = e($data['prepared_by']);
        $cutoff = e($data['material']['cutoff_at'] ?? 'UNSET');
        $linesHtml = '';
        foreach ($data['material']['lines'] as $line) {
            $label = e($line['historical_variant_label']);
            $cond = e($line['condition']);
            $qty = e($line['counted_quantity'] ?? 'UNCOUNTED');
            $val = e($line['unit_value'] ?? 'UNVALUED');
            $linesHtml .= "<tr><td>{$label}</td><td>{$cond}</td><td>{$qty}</td><td>{$val}</td></tr>";
        }
        $teamHtml = '';
        foreach ($data['material']['count_team'] as $member) {
            $uid = e($member['user_id']);
            $role = $member['regular_custodian'] ? 'regular_custodian' : 'independent_observer';
            $teamHtml .= "<li>{$uid} ({$role})</li>";
        }
        $countsHtml = '';
        foreach ($data['counts'] as $count) {
            $actor = e($count['actor_id']);
            $completed = $count['completed'] ? 'completed' : 'draft';
            $signed = e($count['signed_at'] ?? 'UNSIGNED');
            $countsHtml .= "<li>{$actor} | {$completed} | signed_at: {$signed}</li>";
        }
        $authHtml = '';
        foreach ($data['authorizations'] as $auth) {
            $actor = e($auth['actor_id']);
            $duty = e($auth['duty']);
            $signed = e($auth['signed_at']);
            $authHtml .= "<li>{$duty}: {$actor} (signed_at: {$signed})</li>";
        }
        $html = '<!doctype html><html><body><h1>Inventory Physical Count</h1>'
            ."<p>Reference: {$ref} | State: {$state} | Prepared By: {$preparedBy} | Revision: {$data['revision']} | Material Version: {$data['material_version']}</p>"
            ."<p>Cutoff: {$cutoff}</p>"
            ."<h2>Count Team</h2><ul>{$teamHtml}</ul>"
            ."<h2>Lines</h2><table><thead><tr><th>Item</th><th>Condition</th><th>Quantity</th><th>Unit Value (PHP)</th></tr></thead><tbody>{$linesHtml}</tbody></table>"
            ."<h2>Counters</h2><ul>{$countsHtml}</ul>"
            ."<h2>Authorizations</h2><ul>{$authHtml}</ul>"
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
                [$ipc, $rm] = $this->lockIpcThenRm($chapterId, $rmId);
                if (self::rmState($rm) === 'posted') {
                    throw new ContractException(409, 'target_locked', 'Posted Opening RM cannot be replaced.');
                }
                $this->assertBaselineNotPosted($chapterId);
                if ((int) $rm->revision !== $payload['expected_revision']) {
                    throw new ContractException(409, 'version_conflict', 'Opening RM revision is stale.');
                }

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
                $this->checkEvidenceBinding->invalidateActiveForTarget($chapterId, 'opening_receipt', $rm->id);

                $record = $this->formatRm($rm);
                $operation = $this->operationReceipt($operationId, 'replaceOpeningRm', $key, $actor, $chapterId, 'opening_rm', $rm->id, (int) $rm->revision, (int) $rm->material_version, 200, $now);
                $this->recordHistoryAndOutbox('OPENING_RM', $rm->id, $chapterId, (int) $rm->revision, (int) $rm->material_version, 'replaced', $actor, $record, $operation, $payload['reason'], 'stage1.opening-rm.changed.v1');

                return ['data' => ['operation' => $operation, 'record' => $record, 'posting' => null]];
            },
            verifyReplayTarget: fn () => $this->findRm($chapterId, $rmId, lock: false),
        );
    }

    public function inspectOpeningRm(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        OpeningDraftInput::requireUuid($rmId, 'rm_id');
        [$key, $payload] = OpeningDraftInput::parseWrite($request, [OpeningDraftInput::class, 'validateInspectOpeningRm']);
        $actor = $request->user()->id;
        $authority = $this->authority($request);

        return $this->runIdempotentWrite(
            $chapterId,
            $actor,
            'inspectOpeningRm',
            $key,
            $rmId,
            $payload,
            200,
            function (string $operationId) use ($chapterId, $rmId, $actor, $authority, $key, $payload): array {
                [$ipc, $rm] = $this->lockIpcThenRm($chapterId, $rmId);
                $state = self::rmState($rm);
                if ($state === 'posted') {
                    throw new ContractException(409, 'target_locked', 'Posted Opening RM cannot be inspected.');
                }
                if ($state !== 'draft') {
                    throw new ContractException(409, 'invalid_transition', 'Only draft Opening RMs can be inspected.');
                }
                $this->assertBaselineNotPosted($chapterId);
                if ((int) $rm->revision !== $payload['expected_revision']) {
                    throw new ContractException(409, 'version_conflict', 'Opening RM revision is stale.');
                }

                $ipcState = self::ipcState($ipc);
                if ($ipcState === 'posted') {
                    throw new ContractException(409, 'target_locked', 'Source IPC is already posted.');
                }
                if ($ipcState !== 'authorized') {
                    throw new ContractException(409, 'source_not_authorized', 'Source IPC must be authorized before inspection.');
                }

                $rmMaterial = is_array($rm->material_json) ? $rm->material_json : ['ipc_material_version' => 0, 'lines' => [], 'notes' => $rm->notes];
                if ((int) $ipc->material_version !== $payload['ipc_material_version']
                    || ($rmMaterial['ipc_material_version'] ?? null) !== (int) $ipc->material_version) {
                    throw new ContractException(409, 'snapshot_stale', 'Opening RM must match the current authorized IPC material version.');
                }

                $ipcMaterial = $this->normalizedIpcMaterial($ipc);
                $policies = $this->resolvePolicies($authority, $chapterId, $ipc->id, $ipcMaterial, requireAll: true);
                $custodians = $this->assertCompleteIpcMaterial($chapterId, $ipcMaterial);
                $now = now('UTC');
                $completedCounts = $this->assertIndependentAgreedCounts($chapterId, $ipc, $ipcMaterial, $custodians, $now);

                if (! is_array($ipc->signed_ipc_json)) {
                    throw new ContractException(409, 'evidence_missing', 'Source IPC is missing its signed paper binding.');
                }
                $signedIpc = $this->verifyOpeningEvidenceBytes($chapterId, $ipc->signed_ipc_json, $ipc->id, $rm->id);
                $roundingMode = (string) ($policies['valuation_rounding']->rules_json['rounding_mode'] ?? '');
                $ipcTotalPhp = $this->ipcTotalValuation($ipcMaterial['lines'], $roundingMode);
                $authorizations = $this->assertAuthorizationsCurrent($chapterId, $ipc, $signedIpc, $ipcTotalPhp);

                $inspectedAt = CarbonImmutable::parse($payload['inspected_at'], 'UTC');
                if ($inspectedAt->gt($now)) {
                    throw new ContractException(409, 'invalid_source', 'Inspection timestamp cannot be in the future.');
                }
                if ($inspectedAt->lt(CarbonImmutable::parse($ipcMaterial['cutoff_at'], 'UTC'))) {
                    throw new ContractException(409, 'invalid_source', 'Inspection timestamp cannot precede cutoff.');
                }
                foreach ($authorizations as $auth) {
                    if ($inspectedAt->lt(CarbonImmutable::parse($auth['authorized_at'], 'UTC'))) {
                        throw new ContractException(409, 'invalid_source', 'Inspection timestamp cannot precede IPC authorization.');
                    }
                }
                if ($payload['technical_representative_id'] !== null && ! $this->isChapterMember($chapterId, $payload['technical_representative_id'])) {
                    throw new ContractException(409, 'invalid_source', 'Technical representative must be an active chapter member.');
                }

                $this->validateInspectedRmLines($ipcMaterial['lines'], $rmMaterial, $roundingMode);

                $inspection = [
                    'inspector_id' => $actor,
                    'inspected_at' => $payload['inspected_at'],
                    'material_version' => (int) $rm->material_version,
                    'technical_representative_id' => $payload['technical_representative_id'],
                    'inspection_notes' => $payload['inspection_notes'],
                ];
                $snapshot = [
                    'chapter_id' => $chapterId,
                    'rm_id' => $rm->id,
                    'rm_material_version' => (int) $rm->material_version,
                    'ipc_id' => $ipc->id,
                    'ipc_material_version' => (int) $ipc->material_version,
                    'ipc_reference' => (string) $ipc->ipc_number,
                    'material' => $ipcMaterial,
                    'counts' => $completedCounts,
                    'signed_ipc' => $signedIpc,
                    'authorizations' => $authorizations,
                    'rm_material' => $rmMaterial,
                    'inspection' => $inspection,
                ];
                $snapshotSha = CanonicalJson::sha256($snapshot);

                $rm->status = 'inspected';
                $rm->inspector_user_id = $actor;
                $rm->inspection_data = $inspection;
                $rm->snapshot_data = $snapshot;
                $rm->snapshot_sha256 = $snapshotSha;
                $rm->acknowledgment_json = null;
                $rm->evidence_binding_id = null;
                $rm->revision = (int) $rm->revision + 1;
                $rm->updated_at = $now;
                $rm->save();

                $record = $this->formatRm($rm);
                $operation = $this->operationReceipt($operationId, 'inspectOpeningRm', $key, $actor, $chapterId, 'opening_rm', $rm->id, (int) $rm->revision, (int) $rm->material_version, 200, $now);
                $this->recordHistoryAndOutbox('OPENING_RM', $rm->id, $chapterId, (int) $rm->revision, (int) $rm->material_version, 'inspected', $actor, $record, $operation, null, 'stage1.opening-rm.changed.v1');

                return ['data' => ['operation' => $operation, 'record' => $record, 'posting' => null]];
            },
            verifyReplayTarget: fn () => $this->findRm($chapterId, $rmId, lock: false),
        );
    }

    public function matchOpeningRmEvidence(Request $request, string $chapterId, string $rmId): JsonResponse
    {
        OpeningDraftInput::requireUuid($rmId, 'rm_id');
        [$key, $payload] = OpeningDraftInput::parseWrite($request, [OpeningDraftInput::class, 'validateMatchOpeningRmEvidence']);
        $actor = $request->user()->id;
        $authority = $this->authority($request);

        return $this->runIdempotentWrite(
            $chapterId,
            $actor,
            'matchOpeningRmEvidence',
            $key,
            $rmId,
            $payload,
            200,
            function (string $operationId) use ($chapterId, $rmId, $actor, $authority, $key, $payload): array {
                [$ipc, $rm] = $this->lockIpcThenRm($chapterId, $rmId);
                $state = self::rmState($rm);
                if ($state === 'posted') {
                    throw new ContractException(409, 'target_locked', 'Posted Opening RM cannot be matched.');
                }
                $existingBinding = $rm->evidence_binding_id
                    ? EvidenceBinding::where('chapter_id', $chapterId)->whereKey($rm->evidence_binding_id)->sharedLock()->first()
                    : null;
                $effectiveState = $state === 'matched' && $existingBinding && $existingBinding->status !== 'active'
                    ? 'inspected'
                    : $state;
                if ($effectiveState !== 'inspected') {
                    throw new ContractException(409, 'invalid_transition', 'Opening RM must be inspected and awaiting evidence matching.');
                }
                $this->assertBaselineNotPosted($chapterId);

                if (self::ipcState($ipc) !== 'authorized') {
                    throw new ContractException(409, 'source_not_authorized', 'The authorized source IPC is required before matching.');
                }

                $snapshotData = $rm->snapshot_data;
                $preparer = $rm->prepared_by ?? OpeningRecordHistory::where('chapter_id', $chapterId)
                    ->where('record_type', 'OPENING_RM')
                    ->where('record_id', $rm->id)
                    ->where('event_type', 'created')
                    ->sharedLock()
                    ->value('actor_user_id');

                if (! is_array($snapshotData) || ($snapshotData['ipc_id'] ?? null) !== $ipc->id
                    || ($snapshotData['ipc_material_version'] ?? null) !== (int) $ipc->material_version) {
                    throw new ContractException(409, 'snapshot_stale', 'The inspected Opening RM snapshot no longer matches the authorized IPC.');
                }
                if (! $preparer || ($snapshotData['rm_material_version'] ?? null) !== (int) $rm->material_version
                    || ! isset($snapshotData['rm_material'], $snapshotData['inspection']['inspected_at'])) {
                    throw new ContractException(409, 'invalid_source', 'The approved inspection snapshot is required.');
                }

                $ipcMaterial = $this->normalizedIpcMaterial($ipc);
                $policies = $this->resolvePolicies($authority, $chapterId, $ipc->id, $ipcMaterial, requireAll: true);
                $custodians = $this->assertCompleteIpcMaterial($chapterId, $ipcMaterial);
                $now = now('UTC');
                $this->assertIndependentAgreedCounts($chapterId, $ipc, $ipcMaterial, $custodians, $now);

                if (! is_array($ipc->signed_ipc_json) || ! isset($snapshotData['signed_ipc'])) {
                    throw new ContractException(409, 'evidence_missing', 'The signed IPC paper binding is required.');
                }
                if (CanonicalJson::encode($ipc->signed_ipc_json) !== CanonicalJson::encode($snapshotData['signed_ipc'])) {
                    throw new ContractException(409, 'evidence_mismatch', 'The signed IPC paper no longer matches the inspected snapshot.');
                }
                $this->verifyOpeningEvidenceBytes($chapterId, $ipc->signed_ipc_json, $ipc->id, $rm->id);

                $roundingMode = (string) ($policies['valuation_rounding']->rules_json['rounding_mode'] ?? '');
                $ipcTotalPhp = $this->ipcTotalValuation($ipcMaterial['lines'], $roundingMode);
                $authorizations = $this->assertAuthorizationsCurrent($chapterId, $ipc, $ipc->signed_ipc_json, $ipcTotalPhp);
                $this->validateInspectedRmLines($ipcMaterial['lines'], $snapshotData['rm_material'], $roundingMode);

                $evidenceSnapshot = $rm->evidenceSnapshot();
                if ($payload['expected_revision'] !== (int) $rm->revision
                    || $payload['material_version'] !== (int) $rm->material_version
                    || ! hash_equals($evidenceSnapshot['sha256'], $payload['snapshot_sha256'])) {
                    throw new ContractException(409, 'version_conflict', 'The inspected Opening RM snapshot has changed.');
                }

                $inspectedAt = CarbonImmutable::parse($snapshotData['inspection']['inspected_at'], 'UTC');
                $ackAt = CarbonImmutable::parse($payload['acknowledged_at'], 'UTC');
                if ($inspectedAt->lt(CarbonImmutable::parse($ipcMaterial['cutoff_at'], 'UTC')) || $ackAt->lt($inspectedAt) || $ackAt->gt($now)) {
                    throw new ContractException(409, 'invalid_source', 'Acknowledgment timestamp must follow inspection and not be in the future.');
                }
                foreach ($authorizations as $auth) {
                    if ($inspectedAt->lt(CarbonImmutable::parse($auth['authorized_at'], 'UTC'))) {
                        throw new ContractException(409, 'invalid_source', 'Inspection timestamp cannot precede IPC authorization.');
                    }
                }

                $this->verifyOpeningEvidenceBytes($chapterId, $payload['bytes'], $ipc->id, $rm->id);

                $binding = $this->checkEvidenceBinding->recordMatch(
                    $chapterId,
                    $actor,
                    $evidenceSnapshot,
                    $payload['bytes'],
                    null,
                    '',
                    $payload['acknowledged_at'],
                    [],
                );

                $rm->status = 'EVIDENCE_MATCHED';
                $rm->prepared_by ??= $preparer;
                $rm->snapshot_sha256 = $evidenceSnapshot['sha256'];
                $rm->evidence_binding_id = $binding->id;
                $rm->acknowledgment_json = $binding->match_projection;
                $rm->revision = (int) $rm->revision + 1;
                $rm->updated_at = $now;
                $rm->save();

                $record = $this->formatRm($rm);
                $operation = $this->operationReceipt($operationId, 'matchOpeningRmEvidence', $key, $actor, $chapterId, 'opening_rm', $rm->id, (int) $rm->revision, (int) $rm->material_version, 200, $now);
                $this->recordHistoryAndOutbox('OPENING_RM', $rm->id, $chapterId, (int) $rm->revision, (int) $rm->material_version, 'evidence_matched', $actor, $record, $operation, null, 'stage1.opening-rm.changed.v1');

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
        $ipc = $this->findIpc($chapterId, $rm->ipc_id, lock: false);
        $data = $this->formatRm($rm);

        $ref = e($data['reference'] ?? 'UNPOSTED');
        $state = e($data['state']);
        $preparedBy = e((string) ($data['prepared_by'] ?? 'UNKNOWN'));
        $ipcId = e($data['ipc_id']);
        $ipcRef = e($ipc->ipc_number ?? 'UNSUBMITTED');
        $inspector = e($data['inspection']['inspector_id'] ?? 'UNINSPECTED');
        $inspectedAt = e($data['inspection']['inspected_at'] ?? 'UNINSPECTED');
        $matchedBy = e($data['acknowledgment']['matched_by'] ?? 'UNMATCHED');
        $acknowledgedAt = e($data['acknowledgment']['acknowledged_at'] ?? 'UNACKNOWLEDGED');
        $linesHtml = '';
        foreach ($data['material']['lines'] as $line) {
            $lid = e($line['ipc_line_id']);
            $acc = e($line['accepted_quantity'] ?? 'UNSET');
            $dmg = e($line['damaged_quantity'] ?? 'UNSET');
            $rej = e($line['rejected_quantity'] ?? 'UNSET');
            $val = e($line['accepted_value'] ?? 'UNSET');
            $reason = e($line['finding_reason'] ?? '');
            $linesHtml .= "<tr><td>{$lid}</td><td>{$acc}</td><td>{$dmg}</td><td>{$rej}</td><td>{$val}</td><td>{$reason}</td></tr>";
        }
        $html = '<!doctype html><html><body><h1>Opening Receiving Manifest</h1>'
            ."<p>Reference: {$ref} | State: {$state} | Prepared By: {$preparedBy} | Revision: {$data['revision']} | Material Version: {$data['material_version']}</p>"
            ."<p>Source IPC: {$ipcId} ({$ipcRef}) | IPC Material Version: {$data['material']['ipc_material_version']}</p>"
            ."<p>Inspector: {$inspector} ({$inspectedAt}) | Matched By: {$matchedBy} ({$acknowledgedAt})</p>"
            ."<table><thead><tr><th>IPC Line</th><th>Accepted</th><th>Damaged</th><th>Rejected</th><th>Accepted Value (PHP)</th><th>Finding Reason</th></tr></thead><tbody>{$linesHtml}</tbody></table>"
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
            if ($verifyReplayTarget !== null) {
                $verifyReplayTarget();
            }
            if (! hash_equals($existing->fingerprint, $fingerprint)) {
                throw new ContractException(409, 'action_key_conflict', 'Use a new action key for changed input.');
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
        $this->resolvePolicies($authority, $chapterId, $ipcId, $material, requireAll: false);
        [$lines, $recordedCustodians] = $this->validateLinesAndCustody($chapterId, $material['lines'], requireComplete: false);

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
            $this->checkEvidenceBinding->invalidateActiveForTarget($chapterId, 'opening_receipt', $rm->id);

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

        $canReadRm = $authority->allows('opening_rm.read');
        $canReadStock = $authority->allows('stock.read');
        $rmIds = $canReadRm ? $rms->pluck('id')->all() : [];
        $evidence = [];
        if ($authority->allows('evidence.read') && $canReadRm) {
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
                    $current = $ev->currentVersionBlob();
                    if (! $current) {
                        continue;
                    }
                    $versionId = $ev->versionId($current);
                    $blobs = $ev->exactVersion($versionId, ['id', 'version_id', 'payload_path', 'sha256_hash']);
                    if ($blobs->isEmpty()) {
                        continue;
                    }
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
        if ($postedRm && $canReadStock) {
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
            'outcome_id' => $canReadStock ? $postedRm?->outcome_id : null,
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

    public function formatRm(OpeningRm $rm): array
    {
        $material = is_array($rm->material_json) ? $rm->material_json : [
            'ipc_material_version' => 1,
            'lines' => [],
            'notes' => $rm->notes,
        ];

        $binding = $rm->evidence_binding_id
            ? EvidenceBinding::where('chapter_id', $rm->chapter_id)->whereKey($rm->evidence_binding_id)->sharedLock()->first()
            : null;
        $superseded = $binding?->match_projection && $binding->status !== 'active';

        return [
            'id' => $rm->id,
            'chapter_id' => $rm->chapter_id,
            'reference' => $rm->rm_number,
            'ipc_id' => $rm->ipc_id,
            'revision' => (int) $rm->revision,
            'material_version' => (int) $rm->material_version,
            'state' => $superseded && self::rmState($rm) === 'matched' ? 'inspected' : self::rmState($rm),
            'prepared_by' => $rm->prepared_by ?? $rm->inspector_user_id ?? $rm->ipc?->created_by,
            'created_at' => $this->instant($rm->created_at),
            'updated_at' => $this->instant($rm->updated_at),
            'material' => $material,
            'inspection' => $rm->inspection_data,
            'snapshot' => $rm->snapshot_data,
            'snapshot_sha256' => $rm->snapshot_sha256,
            'acknowledgment' => $superseded ? null : ($binding?->match_projection ?? $rm->acknowledgment_json),
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
        $user = User::whereKey($userId)->whereIn('status', ['active', 'enabled'])->sharedLock()->first();
        if (! $user) {
            return false;
        }

        return ChapterMembership::where('chapter_id', $chapterId)
            ->where('user_id', $userId)
            ->current()
            ->sharedLock()
            ->exists();
    }

    /** @return array{OpeningCount, OpeningRm} Acquire IPC sharedLock before RM lockForUpdate to match replaceIpc lock order. */
    private function lockIpcThenRm(string $chapterId, string $rmId): array
    {
        $ipcId = OpeningRm::where('chapter_id', $chapterId)->whereKey($rmId)->value('ipc_id');
        if (! $ipcId) {
            throw new ContractException(404, 'resource_not_found', 'Resource not found.');
        }
        $ipc = $this->findIpc($chapterId, (string) $ipcId, lock: false);
        $rm = $this->findRm($chapterId, $rmId, lock: true);

        return [$ipc, $rm];
    }

    /** @return array<string, PolicyRecord> */
    private function resolvePolicies(ChapterAuthority $authority, string $chapterId, ?string $ipcId, array $material, bool $requireAll): array
    {
        $byKey = [];
        foreach ($material['policies'] ?? [] as $binding) {
            $k = $binding['setting_key'] ?? '';
            if (isset($byKey[$k])) {
                throw new ContractException(409, 'invalid_source', "Duplicate policy binding for {$k}.");
            }
            $byKey[$k] = $binding;
        }

        $resolved = [];
        $blockers = [];
        foreach (self::POLICY_RULES as $key => [$owner, $schema]) {
            if (! isset($byKey[$key])) {
                if ($requireAll) {
                    $blockers[] = ChapterAuthority::setupBlocker($key, $owner, 'missing');
                }

                continue;
            }
            $binding = $byKey[$key];
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
            $state = $authority->policyState($policy, $owner, $schema, $key === 'ipc_authorization' ? $ipcId : null);
            if ($state !== 'effective') {
                $blockers[] = ChapterAuthority::setupBlocker($key, $owner, $state ?? 'unapproved');

                continue;
            }
            $resolved[$key] = $policy;
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

        if (isset($resolved['ipc_authorization'])) {
            $authRules = $resolved['ipc_authorization']->rules_json ?? [];
            if (($material['cutoff_at'] ?? null) !== null && isset($authRules['cutoff_at']) && $material['cutoff_at'] !== $authRules['cutoff_at']) {
                throw new ContractException(409, 'invalid_source', 'Cutoff timestamp does not match the pinned IPC authorization policy.');
            }
            if ($requireAll && ($material['cutoff_at'] ?? null) !== ($authRules['cutoff_at'] ?? null)) {
                throw new ContractException(409, 'invalid_source', 'Cutoff timestamp does not match the pinned IPC authorization policy.');
            }
            $allowedTeam = $authRules['count_team_ids'] ?? [];
            foreach ($material['count_team'] ?? [] as $member) {
                if (! in_array($member['user_id'] ?? '', $allowedTeam, true)) {
                    throw new ContractException(409, 'invalid_source', 'Count team member is not authorized by the pinned IPC authorization policy.');
                }
            }
        }

        return $resolved;
    }

    /** @return array{list<array<string, mixed>>, array<string, bool>} */
    private function validateLinesAndCustody(string $chapterId, array $rawLines, bool $requireComplete): array
    {
        $lineIds = [];
        $recordedCustodians = [];
        $lines = [];
        foreach ($rawLines as $line) {
            if ($requireComplete && (($line['counted_quantity'] ?? null) === null
                || ($line['unit_value'] ?? null) === null
                || ($line['valuation_basis'] ?? null) === null)) {
                throw new ContractException(409, 'source_incomplete', 'Every IPC line requires quantity, unit value, and valuation basis.');
            }
            if (isset($lineIds[$line['line_id']])) {
                throw new ContractException(409, 'invalid_source', 'Duplicate IPC line_id.');
            }
            $lineIds[$line['line_id']] = true;

            $item = CatalogueItem::where('chapter_id', $chapterId)->whereKey($line['item_id'])->sharedLock()->first();
            $variant = CatalogueVariant::where('chapter_id', $chapterId)->whereKey($line['variant_id'])->sharedLock()->first();
            $unit = CatalogueUnit::where('chapter_id', $chapterId)->whereKey($line['unit_id'])->sharedLock()->first();
            $location = CatalogueLocation::where('chapter_id', $chapterId)->whereKey($line['location_id'])->sharedLock()->first();

            if (! $item || ! $variant || ! $unit || ! $location
                || $item->state !== 'active'
                || $variant->state !== 'active'
                || $unit->state !== 'active'
                || $location->state !== 'active'
                || $variant->item_id !== $item->id
                || (($variant->unit_id ?? $item->unit_id) !== null && ($variant->unit_id ?? $item->unit_id) !== $unit->id)
                || (int) $variant->material_version !== (int) $line['variant_material_version']
                || (int) $unit->material_version !== (int) $line['unit_material_version']
                || (int) $location->material_version !== (int) $line['location_material_version']
                || (int) $unit->quantity_scale !== (int) $line['quantity_scale']
                || ($variant->quantity_scale !== null && (int) $variant->quantity_scale !== (int) $line['quantity_scale'])) {
                throw new ContractException(409, 'invalid_source', 'Line catalogue identity, unit scale, or material version is invalid.');
            }

            if ($line['counted_quantity'] !== null && ! $this->fitsScale((string) $line['counted_quantity'], (int) $line['quantity_scale'])) {
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
                if (! $requireComplete && ! $this->isChapterMember($chapterId, $cid)) {
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

        return [$lines, $recordedCustodians];
    }

    /** @return list<string> Recorded custodian user IDs across all IPC lines. */
    private function assertCompleteIpcMaterial(string $chapterId, array $material): array
    {
        if (($material['cutoff_at'] ?? null) === null
            || ($material['informal_movements_suspended'] ?? false) !== true
            || count($material['count_team'] ?? []) < 2
            || count($material['lines'] ?? []) < 1) {
            throw new ContractException(409, 'source_incomplete', 'IPC material is incomplete.');
        }

        [, $custodians] = $this->validateLinesAndCustody($chapterId, $material['lines'], requireComplete: true);

        return array_keys($custodians);
    }

    /**
     * @param  list<string>  $recordedCustodians
     * @return list<array<string, mixed>>
     */
    private function assertIndependentAgreedCounts(string $chapterId, OpeningCount $ipc, array $material, array $recordedCustodians, CarbonInterface $now): array
    {
        $teamIds = array_column($material['count_team'], 'user_id');
        $linesById = [];
        foreach ($material['lines'] as $line) {
            $linesById[$line['line_id']] = $line;
        }
        $cutoffAt = CarbonImmutable::parse($material['cutoff_at'], 'UTC');

        $completed = [];
        $seenActors = [];
        foreach ((array) ($ipc->counts_json ?? []) as $count) {
            if (($count['completed'] ?? false) !== true
                || (int) ($count['material_version'] ?? 0) !== (int) $ipc->material_version) {
                continue;
            }
            $actorId = (string) ($count['actor_id'] ?? '');
            if ($actorId === '' || isset($seenActors[$actorId]) || ! in_array($actorId, $teamIds, true)) {
                continue;
            }
            $seenActors[$actorId] = true;
            $completed[] = $count;
        }

        if (count($completed) < 2) {
            throw new ContractException(409, 'source_incomplete', 'At least two completed independent counts are required.');
        }

        usort($completed, fn (array $a, array $b) => strcmp($a['actor_id'], $b['actor_id']));

        // Recheck active account, chapter membership, and current ipc.count duty in UUID order.
        foreach ($completed as $count) {
            $counterAuth = $this->activeChapterAuthority($chapterId, $count['actor_id']);
            if (! $counterAuth || ! $counterAuth->allows('ipc.count')) {
                throw new ContractException(409, 'invalid_source', 'Completed counter no longer holds current ipc.count authority.');
            }
        }

        $hasIndependent = false;
        foreach ($completed as $count) {
            if (! in_array($count['actor_id'], $recordedCustodians, true)) {
                $hasIndependent = true;
            }
            if (($count['counted_at'] ?? null) === null || ($count['signed_at'] ?? null) === null) {
                throw new ContractException(409, 'source_incomplete', 'Completed counts require count and signature timestamps.');
            }
            $countedAt = CarbonImmutable::parse($count['counted_at'], 'UTC');
            $signedAt = CarbonImmutable::parse($count['signed_at'], 'UTC');
            if ($countedAt->lt($cutoffAt) || $signedAt->lt($countedAt) || $signedAt->gt($now)) {
                throw new ContractException(409, 'invalid_source', 'Completed count timestamps are invalid.');
            }

            $entries = (array) ($count['entries'] ?? []);
            if (count($entries) !== count($linesById)) {
                throw new ContractException(409, 'source_incomplete', 'Completed count must cover every IPC line once.');
            }
            $seenLines = [];
            foreach ($entries as $entry) {
                $lid = (string) ($entry['ipc_line_id'] ?? '');
                if (isset($seenLines[$lid]) || ! isset($linesById[$lid])) {
                    throw new ContractException(409, 'invalid_source', 'Completed count references invalid or duplicate IPC lines.');
                }
                $seenLines[$lid] = true;
                if (($entry['quantity'] ?? null) === null || ($entry['condition'] ?? null) === null) {
                    throw new ContractException(409, 'source_incomplete', 'Completed count entries require quantity and condition.');
                }
                $sourceLine = $linesById[$lid];
                if (! BigDecimal::of((string) $entry['quantity'])->isEqualTo((string) $sourceLine['counted_quantity'])
                    || $entry['condition'] !== $sourceLine['condition']) {
                    throw new ContractException(409, 'count_mismatch', 'Independent counts do not agree with the IPC material.');
                }
            }
        }

        if (! $hasIndependent) {
            throw new ContractException(403, 'independence_required', 'At least one completed counter must be independent of the recorded custodians.');
        }

        return $completed;
    }

    /** @return array<string, mixed> */
    private function verifyOpeningEvidenceBytes(string $chapterId, array $binding, string $expectedIpcId, ?string $expectedRmId = null): array
    {
        return $this->checkEvidenceBinding->verifyCurrentBytes(
            $chapterId,
            $binding,
            'opening_receipt',
            function (EvidenceRecord $record) use ($chapterId, $expectedIpcId, $expectedRmId): bool {
                $targetRm = OpeningRm::where('chapter_id', $chapterId)
                    ->whereKey($record->record_id)
                    ->sharedLock()
                    ->first();

                return $targetRm !== null
                    && $targetRm->ipc_id === $expectedIpcId
                    && ($expectedRmId === null || $targetRm->id === $expectedRmId);
            },
        );
    }

    /** @return list<array<string, mixed>> */
    private function assertAuthorizationsCurrent(string $chapterId, OpeningCount $ipc, array $signedIpc, string $ipcTotalPhp): array
    {
        $byDuty = [];
        $expectedJson = CanonicalJson::encode($signedIpc);
        foreach ((array) ($ipc->authorizations_json ?? []) as $auth) {
            $duty = $auth['duty'] ?? '';
            if (! in_array($duty, ['CHAPTER_HEAD', 'FINANCE'], true)) {
                continue;
            }
            if ((int) ($auth['material_version'] ?? 0) !== (int) $ipc->material_version) {
                throw new ContractException(409, 'snapshot_stale', 'IPC authorization does not match the current material version.');
            }
            if (CanonicalJson::encode($auth['signed_ipc'] ?? null) !== $expectedJson) {
                throw new ContractException(409, 'evidence_mismatch', 'IPC authorization does not match the current signed IPC paper.');
            }
            $byDuty[$duty] = $auth;
        }
        if (! isset($byDuty['CHAPTER_HEAD'], $byDuty['FINANCE'])) {
            throw new ContractException(409, 'source_not_authorized', 'Both Chapter Head and Finance authorizations are required.');
        }

        // Lock signatory identities in UUID order and verify current active authority and monetary ceilings.
        $signatoryIds = array_values(array_unique([$byDuty['CHAPTER_HEAD']['actor_id'], $byDuty['FINANCE']['actor_id']]));
        sort($signatoryIds);
        $authorities = [];
        foreach ($signatoryIds as $uid) {
            $authorities[$uid] = $this->activeChapterAuthority($chapterId, $uid);
        }
        foreach (['CHAPTER_HEAD', 'FINANCE'] as $duty) {
            $sigAuth = $authorities[$byDuty[$duty]['actor_id']] ?? null;
            if (! $sigAuth || ! $sigAuth->allowsDuty($duty, decisionScope: 'ipc_authorization:'.$ipc->id, amount: $ipcTotalPhp)) {
                throw new ContractException(409, 'source_not_authorized', "IPC {$duty} signatory no longer holds applicable authority.");
            }
        }

        return [$byDuty['CHAPTER_HEAD'], $byDuty['FINANCE']];
    }

    private function activeChapterAuthority(string $chapterId, string $userId): ?ChapterAuthority
    {
        $user = User::whereKey($userId)->whereIn('status', ['active', 'enabled'])->sharedLock()->first();
        if (! $user) {
            return null;
        }
        $membership = $user->memberships()->where('chapter_id', $chapterId)->current()->sharedLock()->first();
        $chapter = Chapter::whereKey($chapterId)->whereIn('status', ChapterAuthority::AVAILABLE_CHAPTERS)->sharedLock()->first();
        if (! $membership || ! $chapter) {
            return null;
        }

        return ChapterAuthority::fromMembership($membership, $chapter);
    }

    private function validateInspectedRmLines(array $ipcLines, array $rmMaterial, string $roundingMode): void
    {
        $mode = $this->roundingMode($roundingMode);

        $ipcById = [];
        foreach ($ipcLines as $line) {
            $ipcById[$line['line_id']] = $line;
        }

        $seen = [];
        $total = BigDecimal::zero();
        $max = BigDecimal::of(self::MAX_PHP_VALUE);
        foreach ($rmMaterial['lines'] ?? [] as $rmLine) {
            $lid = (string) ($rmLine['ipc_line_id'] ?? '');
            if (isset($seen[$lid]) || ! isset($ipcById[$lid])) {
                throw new ContractException(409, 'invalid_source', 'Opening RM inspection lines must reference each authorized IPC line once.');
            }
            $seen[$lid] = true;

            if (($rmLine['accepted_quantity'] ?? null) === null
                || ($rmLine['damaged_quantity'] ?? null) === null
                || ($rmLine['rejected_quantity'] ?? null) === null
                || ($rmLine['accepted_value'] ?? null) === null) {
                throw new ContractException(409, 'source_incomplete', 'Every Opening RM line requires accepted, damaged, rejected quantities and accepted value.');
            }

            $src = $ipcById[$lid];
            $scale = (int) $src['quantity_scale'];
            foreach (['accepted_quantity', 'damaged_quantity', 'rejected_quantity'] as $field) {
                if (! $this->fitsScale((string) $rmLine[$field], $scale)) {
                    throw new ContractException(409, 'invalid_source', 'Opening RM quantity exceeds the approved unit scale.');
                }
            }

            $acc = BigDecimal::of((string) $rmLine['accepted_quantity']);
            $dmg = BigDecimal::of((string) $rmLine['damaged_quantity']);
            $rej = BigDecimal::of((string) $rmLine['rejected_quantity']);
            if (! $acc->plus($dmg)->plus($rej)->isEqualTo((string) $src['counted_quantity'])) {
                throw new ContractException(409, 'invalid_source', 'Accepted, damaged, and rejected quantities must equal the authorized IPC count.');
            }
            if ($src['condition'] !== 'usable' && $acc->isPositive()) {
                throw new ContractException(409, 'invalid_source', 'Damaged or rejected source lines cannot be accepted without renewed source treatment.');
            }

            $expected = $acc->multipliedBy((string) $src['unit_value'])->toScale(2, $mode);
            if ($expected->isGreaterThan($max)) {
                throw new ContractException(409, 'invalid_source', 'Accepted line valuation exceeds supported PHP bounds.');
            }
            if ($rmLine['accepted_value'] !== (string) $expected) {
                throw new ContractException(409, 'invalid_source', 'Accepted value does not match approved valuation rounding.');
            }
            $total = $total->plus($expected);
            if ($total->isGreaterThan($max)) {
                throw new ContractException(409, 'invalid_source', 'Total accepted valuation exceeds supported PHP bounds.');
            }
        }

        if (count($seen) !== count($ipcById)) {
            throw new ContractException(409, 'source_incomplete', 'Opening RM inspection must include every authorized IPC line.');
        }
    }

    private function ipcTotalValuation(array $ipcLines, string $roundingMode): string
    {
        $mode = $this->roundingMode($roundingMode);
        $total = BigDecimal::zero();
        $max = BigDecimal::of(self::MAX_PHP_VALUE);
        foreach ($ipcLines as $line) {
            $lineVal = BigDecimal::of((string) $line['counted_quantity'])
                ->multipliedBy((string) $line['unit_value'])
                ->toScale(2, $mode);
            $total = $total->plus($lineVal);
            if ($total->isGreaterThan($max)) {
                throw new ContractException(409, 'invalid_source', 'Total IPC valuation exceeds supported PHP bounds.');
            }
        }

        return (string) $total->toScale(2, $mode);
    }

    private function roundingMode(string $mode): RoundingMode
    {
        return match ($mode) {
            'half_up' => RoundingMode::HalfUp,
            'half_even' => RoundingMode::HalfEven,
            'down' => RoundingMode::Down,
            default => throw new ContractException(409, 'invalid_source', 'Unsupported valuation rounding mode.'),
        };
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
