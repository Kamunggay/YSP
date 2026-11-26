<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Middleware\EnforceBrowserAuthority;
use App\Models\ActualIssue;
use App\Models\ActualIssueHistory;
use App\Models\ActualIssueLine;
use App\Models\EvidenceBinding;
use App\Models\Handover;
use App\Models\IdempotencyRecord;
use App\Models\InternalRf;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\InventoryPosting;
use App\Models\IssueReconciliation;
use App\Models\StockHoldRange;
use App\Models\StockReservation;
use App\Services\Authority\ChapterAuthority;
use App\Services\Delivery\RequisitionIssueService;
use App\Services\Evidence\Participants\CheckEvidenceBindingParticipant;
use App\Services\Inventory\InternalRfService;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\BcMath;
use App\Services\Shared\CanonicalJson;
use App\Services\Shared\ReferenceSequenceService;
use DomainException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ActualIssueController extends Controller
{
    public function __construct(
        protected RequisitionIssueService $issueService,
        protected CheckEvidenceBindingParticipant $checkEvidenceBinding,
        protected ReferenceSequenceService $referenceSequences,
        protected InternalRfService $rfService,
        protected DomainNotificationOutboxService $outbox
    ) {}

    /**
     * POST /api/v1/chapters/{chapter_id}/internal-rfs/{rf_id}/actual-issues
     */
    public function prepare(Request $request, string $chapterId, string $rfId): JsonResponse
    {
        $userId = $this->actorId($request);
        $actionKey = $this->actionKey($request);

        try {
            $rf = InternalRf::where('chapter_id', $chapterId)->where('id', $rfId)->with('lines')->first();

            if ($rf) {
                if ($rf->status !== 'approved') {
                    throw new ContractException(409, 'approval_invalid', 'RF must be approved before preparing an actual issue.', [
                        'failed_intent_committed' => false,
                    ]);
                }

                if ($request->has('expected_rf_version') && (int) $request->input('expected_rf_version') !== (int) $rf->version) {
                    throw new ContractException(409, 'version_conflict', 'expected_rf_version mismatch.', [
                        'failed_intent_committed' => false,
                    ]);
                }
                if ($request->has('expected_rf_material_version') && (int) $request->input('expected_rf_material_version') !== (int) $rf->material_version) {
                    throw new ContractException(409, 'material_version_conflict', 'expected_rf_material_version mismatch.', [
                        'failed_intent_committed' => false,
                    ]);
                }
                if ($request->has('expected_rf_progress_version') && (int) $request->input('expected_rf_progress_version') !== (int) $rf->progress_version) {
                    throw new ContractException(409, 'progress_version_conflict', 'expected_rf_progress_version mismatch.', [
                        'failed_intent_committed' => false,
                    ]);
                }
            }

            $rawLines = $request->input('lines');
            if (! is_array($rawLines) || empty($rawLines)) {
                return response()->json([
                    'error' => ['code' => 'invalid_input', 'message' => 'lines must be a non-empty array.'],
                ], 422, ['Cache-Control' => 'no-store']);
            }

            $recipientId = $request->input('recipient_id');
            $recipientName = $request->input('recipient_name') ?? $recipientId ?? 'Internal Recipient';

            if ($recipientId && $recipientId === $userId) {
                throw new ContractException(409, 'recipient_invalid', 'Issuing officer cannot be the recipient of their own actual issue.', [
                    'failed_intent_committed' => false,
                ]);
            }

            $this->validateDisjointLineTargets($rawLines);

            return DB::transaction(function () use ($chapterId, $rfId, $rf, $userId, $request, $rawLines, $recipientId, $recipientName, $actionKey) {
                $seq = $this->referenceSequences->nextReference($chapterId, 'IS_AR');
                $issueNumber = $seq['reference'];
                $handedOverAt = $request->input('handed_over_at');
                $acknowledgedAt = $request->input('acknowledged_at');

                $preparedLines = [];
                foreach ($rawLines as $idx => $line) {
                    if ($rf && ! empty($line['targets'])) {
                        // OpenAPI Ticket 08 line structure: rf_line_id, reservation_id, targets[]
                        $rfLineId = (string) ($line['rf_line_id'] ?? '');
                        $resId = (string) ($line['reservation_id'] ?? '');
                        $rfLine = $rf->lines->firstWhere('id', $rfLineId);
                        if (! $rfLine) {
                            throw new ContractException(404, 'invalid_source', "RF line {$rfLineId} not found.");
                        }

                        $reservation = StockReservation::where('chapter_id', $chapterId)
                            ->where('source_type', 'RF')
                            ->where('source_id', $rf->id)
                            ->where('id', $resId)
                            ->with('allocations')
                            ->lockForUpdate()
                            ->first();

                        if (! $reservation || $reservation->status !== 'ACTIVE') {
                            throw new ContractException(409, 'reservation_conflict', "Reservation {$resId} is not active.");
                        }

                        if (isset($line['expected_reservation_version']) && (int) $line['expected_reservation_version'] !== (int) $reservation->version) {
                            throw new ContractException(409, 'version_conflict', 'Reservation version conflict.');
                        }
                        if (isset($line['expected_reservation_material_version']) && (int) $line['expected_reservation_material_version'] !== (int) $reservation->material_version) {
                            throw new ContractException(409, 'material_version_conflict', 'Reservation material_version conflict.');
                        }

                        foreach ($line['targets'] as $tIdx => $target) {
                            if (! is_string($target['quantity'] ?? null) || ! preg_match('/^\d+(?:\.\d{1,6})?$/', $target['quantity'])) {
                                throw new ContractException(422, 'invalid_input', "Target {$tIdx} quantity must be a decimal string.");
                            }
                            $lotId = (string) $target['stock_lot_id'];
                            $segId = (string) ($target['basis_segment_id'] ?? $lotId);
                            $offset = BcMath::str($target['offset_quantity'] ?? '0');
                            $qty = BcMath::str($target['quantity']);

                            if (BcMath::comp($qty, '0') <= 0) {
                                throw new ContractException(422, 'invalid_input', 'Target quantity must be positive.');
                            }

                            // Verify active unheld reserved interval
                            $ownsInterval = false;
                            foreach ($reservation->allocations->where('status', 'active') as $alloc) {
                                $rem = BcMath::sub($alloc->quantity, BcMath::add($alloc->consumed_quantity, $alloc->released_quantity));
                                if ($alloc->lot_id === $lotId && $alloc->basis_segment_id === $segId && BcMath::intervalContains($alloc->offset_quantity, $rem, $offset, $qty)) {
                                    $ownsInterval = true;
                                    break;
                                }
                            }
                            if (! $ownsInterval) {
                                throw new ContractException(409, 'reservation_conflict', 'Requested target interval is not covered by active reservation allocations.');
                            }

                            $activeHolds = StockHoldRange::where('chapter_id', $chapterId)
                                ->where('lot_id', $lotId)
                                ->whereHas('hold', fn ($q) => $q->where('status', 'active'))
                                ->get();
                            foreach ($activeHolds as $hr) {
                                if (BcMath::intervalsOverlap($offset, $qty, $hr->offset_quantity, $hr->quantity)) {
                                    throw new ContractException(409, 'stock_held', 'Target interval is currently under an active stock hold.');
                                }
                            }

                            $lot = InventoryLot::where('chapter_id', $chapterId)->where('id', $lotId)->first();
                            if (! $lot) {
                                throw new ContractException(404, 'invalid_source', "Stock lot {$lotId} not found.");
                            }

                            $preparedLines[] = [
                                'rf_line_id' => $rfLine->id,
                                'reservation_id' => $reservation->id,
                                'variant_id' => $rfLine->variant_id,
                                'unit_id' => $rfLine->unit_id,
                                'lot_id' => $lot->id,
                                'basis_segment_id' => $segId,
                                'offset_quantity' => $offset,
                                'allocated_quantity' => $qty,
                                'issued_quantity' => $qty,
                            ];
                        }
                    } else {
                        $variantId = (string) ($line['variant_id'] ?? '');
                        $unitId = (string) ($line['unit_id'] ?? '');
                        if ($variantId === '' || $unitId === '') {
                            throw new ContractException(422, 'invalid_input', "Line {$idx} requires variant_id and unit_id.");
                        }

                        $rawQty = $line['issued_quantity'] ?? $line['actual_quantity'] ?? $line['allocated_quantity'] ?? null;
                        if ($rf && ! is_string($rawQty)) {
                            throw new ContractException(422, 'invalid_input', 'Quantities must be decimal strings.');
                        }

                        $issuedQty = BcMath::str($rawQty ?? '0');
                        $allocatedQty = BcMath::str($line['allocated_quantity'] ?? $issuedQty);
                        $preparedLines[] = [
                            'rf_line_id' => $line['rf_line_id'] ?? $line['requisition_line_id'] ?? $line['source_line_id'] ?? (string) Str::uuid(),
                            'reservation_id' => $line['reservation_id'] ?? null,
                            'variant_id' => $variantId,
                            'unit_id' => $unitId,
                            'lot_id' => $line['lot_id'] ?? $line['stock_lot_id'] ?? null,
                            'basis_segment_id' => $line['basis_segment_id'] ?? ($line['lot_id'] ?? $line['stock_lot_id'] ?? null),
                            'offset_quantity' => BcMath::str($line['offset_quantity'] ?? '0'),
                            'allocated_quantity' => $allocatedQty,
                            'issued_quantity' => $issuedQty,
                        ];
                    }
                }

                $issueId = (string) Str::uuid();
                $material = $this->buildMaterialSnapshot($chapterId, $issueId, $issueNumber, $seq, $rf, $userId, $recipientId, $recipientName, $preparedLines, $handedOverAt, $acknowledgedAt, (bool) ($request->input('recipient_accepts_partial', false)));
                $materialSha = CanonicalJson::sha256($material);

                $issue = ActualIssue::create([
                    'id' => $issueId,
                    'chapter_id' => $chapterId,
                    'requisition_id' => $rfId,
                    'issue_number' => $issueNumber,
                    'status' => 'prepared',
                    'version' => 1,
                    'material_version' => 1,
                    'recipient_user_id' => $recipientId,
                    'recipient_name' => $recipientName,
                    'prepared_by_user_id' => $userId,
                    'actual_handover_at' => $handedOverAt,
                    'handed_over_at' => $handedOverAt,
                    'acknowledged_at' => $acknowledgedAt,
                    'entered_at' => now(),
                    'recipient_accepts_partial' => (bool) ($request->input('recipient_accepts_partial', false)),
                    'handover_fence' => 'none',
                    'evidence_binding_id' => null,
                    'material_json' => $material,
                    'material_sha256' => $materialSha,
                ]);

                foreach ($preparedLines as $pl) {
                    ActualIssueLine::create([
                        'actual_issue_id' => $issue->id,
                        'requisition_line_id' => $pl['rf_line_id'],
                        'reservation_id' => $pl['reservation_id'],
                        'variant_id' => $pl['variant_id'],
                        'unit_id' => $pl['unit_id'],
                        'lot_id' => $pl['lot_id'],
                        'basis_segment_id' => $pl['basis_segment_id'],
                        'offset_quantity' => $pl['offset_quantity'],
                        'allocated_quantity' => $pl['allocated_quantity'],
                        'issued_quantity' => $pl['issued_quantity'],
                    ]);
                }

                $formatted = $this->issueService->formatIssue($issue->fresh(['lines', 'reconciliations']));
                ActualIssueHistory::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $chapterId,
                    'actual_issue_id' => $issue->id,
                    'version' => 1,
                    'material_version' => 1,
                    'event_type' => 'prepared',
                    'actor_user_id' => $userId,
                    'reason' => null,
                    'snapshot_json' => $formatted,
                    'created_at' => now(),
                ]);

                $this->outbox->recordIntent('stage1.actual-issue.changed.v1', $chapterId, $issue->id, $issue->version, $issue->material_version);

                $operationId = (string) Str::uuid();
                $response = [
                    'data' => $formatted,
                    'operation_id' => $operationId,
                    'operation_name' => 'prepareActualIssue',
                    'action_key' => $actionKey ?? $operationId,
                    'result' => $formatted,
                ];

                if ($actionKey !== null) {
                    IdempotencyRecord::create([
                        'id' => $operationId,
                        'key' => $actionKey,
                        'chapter_id' => $chapterId,
                        'user_id' => $userId,
                        'operation_name' => 'prepareActualIssue',
                        'resource_id' => $issue->id,
                        'state' => 'committed',
                        'payload_hash' => CanonicalJson::sha256($request->all()),
                        'response_code' => 201,
                        'response_body' => json_encode($response),
                        'expires_at' => now()->addDays(7),
                    ]);
                }

                return response()->json($response, 201, ['Cache-Control' => 'no-store']);
            });
        } catch (ContractException $e) {
            return response()->json($e->toArray(), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/internal-rfs/{rf_id}/actual-issues
     */
    public function index(string $chapterId, string $rfId): JsonResponse
    {
        $issues = ActualIssue::with(['lines', 'reconciliations'])
            ->where('chapter_id', $chapterId)
            ->where('requisition_id', $rfId)
            ->latest()
            ->get();

        $data = $issues->map(fn (ActualIssue $i) => $this->issueService->formatIssue($i))->values();

        return response()->json([
            'data' => $data,
            'page' => ['has_more' => false, 'next_cursor' => null, 'total_elements' => $data->count()],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}
     */
    public function show(string $chapterId, string $issueId): JsonResponse
    {
        $issue = ActualIssue::with(['lines', 'reconciliations'])
            ->where('chapter_id', $chapterId)
            ->where('id', $issueId)
            ->first();

        if (! $issue) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Actual issue not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        return response()->json(['data' => $this->issueService->formatIssue($issue)], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * PUT /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}
     */
    public function revise(Request $request, string $chapterId, string $issueId): JsonResponse
    {
        $userId = $this->actorId($request);
        $actionKey = $this->actionKey($request);

        try {
            return DB::transaction(function () use ($request, $chapterId, $issueId, $userId, $actionKey) {
                $issue = ActualIssue::where('chapter_id', $chapterId)
                    ->where('id', $issueId)
                    ->with('lines')
                    ->lockForUpdate()
                    ->first();

                if (! $issue) {
                    throw new ContractException(404, 'resource_not_found', 'Actual issue not found.');
                }

                if ($issue->status === 'posted') {
                    throw new ContractException(409, 'already_posted', 'Cannot revise posted issue.', [
                        'failed_intent_committed' => false,
                        'current' => $this->issueService->formatIssue($issue),
                    ]);
                }

                if ($issue->handover_fence === 'unresolved') {
                    throw new ContractException(409, 'handover_unresolved', 'Reconcile unresolved handover before revising actual issue.', [
                        'failed_intent_committed' => false,
                        'current' => $this->issueService->formatIssue($issue),
                    ]);
                }

                if ($request->has('expected_version') && (int) $request->input('expected_version') !== (int) ($issue->version ?? 1)) {
                    throw new ContractException(409, 'version_conflict', 'expected_version mismatch.', [
                        'failed_intent_committed' => false,
                        'current' => $this->issueService->formatIssue($issue),
                    ]);
                }

                if ($request->has('expected_material_version') && (int) $request->input('expected_material_version') !== (int) $issue->material_version) {
                    throw new ContractException(409, 'material_version_conflict', 'expected_material_version mismatch.', [
                        'failed_intent_committed' => false,
                        'current' => $this->issueService->formatIssue($issue),
                    ]);
                }

                $rawLines = $request->input('lines');
                if (is_array($rawLines) && ! empty($rawLines)) {
                    $this->validateDisjointLineTargets($rawLines);
                }

                // Atomically invalidate prior evidence binding if present
                if ($issue->evidence_binding_id) {
                    EvidenceBinding::where('id', $issue->evidence_binding_id)
                        ->update(['status' => 'invalidated']);
                }

                $recipientId = $request->input('recipient_id', $issue->recipient_user_id);
                if ($recipientId && $recipientId === $userId) {
                    throw new ContractException(409, 'recipient_invalid', 'Issuing officer cannot be the recipient.');
                }

                $issue->recipient_user_id = $recipientId;
                $issue->recipient_name = $request->input('recipient_name', $recipientId ?? $issue->recipient_name);
                if ($request->has('handed_over_at')) {
                    $issue->handed_over_at = $request->input('handed_over_at');
                    $issue->actual_handover_at = $request->input('handed_over_at');
                }
                if ($request->has('acknowledged_at')) {
                    $issue->acknowledged_at = $request->input('acknowledged_at');
                }
                if ($request->has('recipient_accepts_partial')) {
                    $issue->recipient_accepts_partial = (bool) $request->input('recipient_accepts_partial');
                }

                $rawLines = $request->input('lines');
                if (is_array($rawLines) && ! empty($rawLines)) {
                    $issue->lines()->delete();
                    foreach ($rawLines as $line) {
                        if (! empty($line['targets'])) {
                            foreach ($line['targets'] as $target) {
                                $qty = BcMath::str($target['quantity']);
                                $lotId = $target['stock_lot_id'];
                                $lot = InventoryLot::find($lotId);
                                ActualIssueLine::create([
                                    'actual_issue_id' => $issue->id,
                                    'requisition_line_id' => $line['rf_line_id'] ?? (string) Str::uuid(),
                                    'reservation_id' => $line['reservation_id'] ?? null,
                                    'variant_id' => $lot?->variant_id ?? ($line['variant_id'] ?? ''),
                                    'unit_id' => $lot?->unit_id ?? ($line['unit_id'] ?? ''),
                                    'lot_id' => $lotId,
                                    'basis_segment_id' => $target['basis_segment_id'] ?? $lotId,
                                    'offset_quantity' => BcMath::str($target['offset_quantity'] ?? '0'),
                                    'allocated_quantity' => $qty,
                                    'issued_quantity' => $qty,
                                ]);
                            }
                        } else {
                            ActualIssueLine::create([
                                'actual_issue_id' => $issue->id,
                                'requisition_line_id' => $line['rf_line_id'] ?? $line['requisition_line_id'] ?? (string) Str::uuid(),
                                'reservation_id' => $line['reservation_id'] ?? null,
                                'variant_id' => $line['variant_id'],
                                'unit_id' => $line['unit_id'],
                                'lot_id' => $line['lot_id'] ?? $line['stock_lot_id'] ?? null,
                                'basis_segment_id' => $line['basis_segment_id'] ?? null,
                                'offset_quantity' => BcMath::str($line['offset_quantity'] ?? '0'),
                                'allocated_quantity' => BcMath::str($line['allocated_quantity'] ?? $line['issued_quantity'] ?? 0),
                                'issued_quantity' => BcMath::str($line['issued_quantity'] ?? $line['actual_quantity'] ?? 0),
                            ]);
                        }
                    }
                }

                $issue->version = ((int) ($issue->version ?? 1)) + 1;
                $issue->material_version += 1;
                $issue->status = 'prepared';
                $issue->handover_fence = 'none';
                $issue->evidence_binding_id = null;
                $issue->matched_at = null;
                $issue->matched_by_user_id = null;

                $freshLines = $issue->fresh('lines')->lines->map(fn (ActualIssueLine $l) => [
                    'rf_line_id' => $l->requisition_line_id,
                    'reservation_id' => $l->reservation_id,
                    'variant_id' => $l->variant_id,
                    'unit_id' => $l->unit_id,
                    'lot_id' => $l->lot_id,
                    'basis_segment_id' => $l->basis_segment_id,
                    'offset_quantity' => $l->offset_quantity,
                    'issued_quantity' => $l->issued_quantity,
                ])->all();

                $rf = InternalRf::find($issue->requisition_id);
                $seq = $this->referenceSequences->resolveSeriesPolicy($chapterId, 'IS_AR');
                $material = $this->buildMaterialSnapshot(
                    $chapterId,
                    $issue->id,
                    $issue->issue_number,
                    $seq,
                    $rf,
                    $issue->prepared_by_user_id,
                    $issue->recipient_user_id,
                    $issue->recipient_name,
                    $freshLines,
                    $issue->handed_over_at?->format('Y-m-d\TH:i:s.u\Z'),
                    $issue->acknowledged_at?->format('Y-m-d\TH:i:s.u\Z'),
                    (bool) $issue->recipient_accepts_partial,
                    (int) $issue->material_version
                );
                $issue->material_json = $material;
                $issue->material_sha256 = CanonicalJson::sha256($material);
                $issue->save();

                $formatted = $this->issueService->formatIssue($issue->fresh(['lines', 'reconciliations']));
                ActualIssueHistory::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $chapterId,
                    'actual_issue_id' => $issue->id,
                    'version' => (int) $issue->version,
                    'material_version' => (int) $issue->material_version,
                    'event_type' => 'revised',
                    'actor_user_id' => $userId,
                    'reason' => $request->input('reason'),
                    'snapshot_json' => $formatted,
                    'created_at' => now(),
                ]);

                $this->outbox->recordIntent('stage1.actual-issue.changed.v1', $chapterId, $issue->id, $issue->version, $issue->material_version);

                $operationId = (string) Str::uuid();
                $response = [
                    'data' => $formatted,
                    'operation_id' => $operationId,
                    'operation_name' => 'reviseActualIssue',
                    'action_key' => $actionKey ?? $operationId,
                    'result' => $formatted,
                ];

                if ($actionKey !== null) {
                    IdempotencyRecord::create([
                        'id' => $operationId,
                        'key' => $actionKey,
                        'chapter_id' => $chapterId,
                        'user_id' => $userId,
                        'operation_name' => 'reviseActualIssue',
                        'resource_id' => $issue->id,
                        'state' => 'committed',
                        'payload_hash' => CanonicalJson::sha256($request->all()),
                        'response_code' => 200,
                        'response_body' => json_encode($response),
                        'expires_at' => now()->addDays(7),
                    ]);
                }

                return response()->json($response, 200, ['Cache-Control' => 'no-store']);
            });
        } catch (ContractException $e) {
            return response()->json($e->toArray(), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/print
     */
    public function print(string $chapterId, string $issueId): JsonResponse
    {
        $issue = ActualIssue::with('lines')->where('chapter_id', $chapterId)->where('id', $issueId)->first();
        if (! $issue) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Actual issue not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $printedAt = now();
        $issue->printed_at = $printedAt;
        $issue->save();

        $watermark = strtoupper($issue->status);
        $escapedRef = e($issue->issue_number);
        $escapedRecipient = e($issue->recipient_name);
        $escapedStatus = e($watermark);

        $rowsHtml = '';
        foreach ($issue->lines as $line) {
            $rowsHtml .= '<tr><td>'.e($line->variant_id).'</td><td>'.e($line->unit_id).'</td><td>'.e(BcMath::format($line->issued_quantity)).'</td></tr>';
        }

        $html = "<div class='is-ar-voucher' data-watermark='{$escapedStatus}'>"
            ."<div class='watermark'>{$escapedStatus}</div>"
            .'<h3>Issue Slip &amp; Acknowledgment Receipt</h3>'
            ."<p>Issue: {$escapedRef}</p>"
            ."<p>Recipient: {$escapedRecipient}</p>"
            ."<table><tbody>{$rowsHtml}</tbody></table>"
            .'</div>';

        return response()->json([
            'data' => [
                'issue' => $this->issueService->formatIssue($issue),
                'voucher_type' => 'IS_AR',
                'voucher_number' => $issue->issue_number,
                'status_watermark' => $watermark,
                'printed_at' => $printedAt->format('Y-m-d\TH:i:s.u\Z'),
                'printable_html' => $html,
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/acknowledgments
     */
    public function matchAcknowledgment(Request $request, string $chapterId, string $issueId): JsonResponse
    {
        $userId = $this->actorId($request);
        $actionKey = $this->actionKey($request);

        try {
            return DB::transaction(function () use ($request, $chapterId, $issueId, $userId, $actionKey) {
                $issue = ActualIssue::where('chapter_id', $chapterId)
                    ->where('id', $issueId)
                    ->with('lines')
                    ->lockForUpdate()
                    ->first();

                if (! $issue) {
                    throw new ContractException(404, 'resource_not_found', 'Actual issue not found.');
                }

                if ($issue->status === 'posted') {
                    throw new ContractException(409, 'already_posted', 'Actual issue is already posted.', [
                        'failed_intent_committed' => false,
                        'current' => $this->issueService->formatIssue($issue),
                    ]);
                }

                if ($issue->status === 'invalidated') {
                    throw new ContractException(409, 'material_version_conflict', 'Invalidated actual issue must be revised before matching acknowledgment.', [
                        'failed_intent_committed' => false,
                        'current' => $this->issueService->formatIssue($issue),
                    ]);
                }

                if ($issue->handover_fence === 'disputed') {
                    throw new ContractException(409, 'handover_unresolved', 'Disputed actual issue must be revised before matching acknowledgment.', [
                        'failed_intent_committed' => false,
                        'current' => $this->issueService->formatIssue($issue),
                    ]);
                }

                if ($request->has('expected_version') && (int) $request->input('expected_version') !== (int) ($issue->version ?? 1)) {
                    throw new ContractException(409, 'version_conflict', 'expected_version mismatch.', [
                        'failed_intent_committed' => false,
                        'current' => $this->issueService->formatIssue($issue),
                    ]);
                }

                if ($request->has('expected_material_version') && (int) $request->input('expected_material_version') !== (int) $issue->material_version) {
                    throw new ContractException(409, 'material_version_conflict', 'expected_material_version mismatch.', [
                        'failed_intent_committed' => false,
                        'current' => $this->issueService->formatIssue($issue),
                    ]);
                }

                if ($issue->recipient_user_id && $issue->recipient_user_id === $userId) {
                    throw new ContractException(403, 'recipient_invalid', 'Recipient cannot match their own acknowledgment.');
                }

                if ($request->has('expected_snapshot')) {
                    $snap = $request->input('expected_snapshot');
                    if (
                        ($snap['sha256'] ?? null) !== $issue->material_sha256
                        || (int) ($snap['material_version'] ?? 0) !== (int) $issue->material_version
                    ) {
                        throw new ContractException(409, 'material_version_conflict', 'expected_snapshot does not match current material.', [
                            'failed_intent_committed' => false,
                            'current' => $this->issueService->formatIssue($issue),
                        ]);
                    }
                }

                if ($request->has('matches_paper') && $request->input('matches_paper') !== true) {
                    throw new ContractException(422, 'invalid_input', 'matches_paper must be true.');
                }

                $evidenceInput = $request->input('evidence', []);
                if (! is_array($evidenceInput)) {
                    throw new ContractException(422, 'invalid_input', 'Supply an evidence binding object.');
                }
                $bindingId = $request->input('evidence_binding_id') ?? $evidenceInput['binding_id'] ?? null;
                $evidenceId = $request->input('evidence_id') ?? $evidenceInput['evidence_id'] ?? null;

                if (array_key_exists('version_id', $evidenceInput)) {
                    $snapshot = $issue->evidenceSnapshot();
                    if (CanonicalJson::encode($request->input('expected_snapshot')) !== CanonicalJson::encode($snapshot)) {
                        throw new ContractException(409, 'material_version_conflict', 'The issue snapshot has changed.', [
                            'failed_intent_committed' => false, 'current' => null, 'setup_blockers' => [],
                        ]);
                    }
                    $handoverAt = $issue->handed_over_at ?? $issue->actual_handover_at;
                    if ($request->input('matches_paper') !== true || ! $issue->recipient_user_id || ! $issue->acknowledged_at
                        || ! $handoverAt || $handoverAt->gt($issue->acknowledged_at)
                        || $issue->acknowledged_at->isFuture()) {
                        throw new ContractException(409, 'recipient_invalid', 'A named recipient and valid actual acknowledgment are required.', [
                            'failed_intent_committed' => false, 'current' => null, 'setup_blockers' => [],
                        ]);
                    }
                    $binding = $this->checkEvidenceBinding->recordMatch(
                        $chapterId, $userId, $snapshot, $evidenceInput, $issue->recipient_user_id, $issue->recipient_name,
                        $issue->acknowledged_at->utc()->format('Y-m-d\TH:i:s.u\Z'), null,
                    );
                    $result = ['acknowledgment_id' => $binding->id];
                } else {
                    $checkLines = $issue->lines->map(fn (ActualIssueLine $l) => [
                        'variant_id' => $l->variant_id,
                        'unit_id' => $l->unit_id,
                        'quantity' => $l->issued_quantity,
                    ])->values()->all();

                    try {
                        $result = $this->checkEvidenceBinding->check([
                            'chapter_id' => $chapterId,
                            'evidence_id' => $evidenceId,
                            'binding_id' => $bindingId,
                            'source_type' => 'actual_issue',
                            'source_id' => $issue->id,
                            'recipient_name' => $issue->recipient_name,
                            'lines' => $checkLines,
                        ], strict: true);
                    } catch (DomainException $e) {
                        throw new ContractException(409, 'evidence_mismatch', $e->getMessage(), [
                            'failed_intent_committed' => false,
                            'current' => $this->issueService->formatIssue($issue),
                        ]);
                    }
                }

                $issue->evidence_binding_id = $result['acknowledgment_id'] ?? $bindingId;
                $issue->status = 'acknowledged';
                $issue->handover_fence = 'unresolved';
                $issue->matched_at = now();
                $issue->matched_by_user_id = $userId;
                $issue->version = ((int) ($issue->version ?? 1)) + 1;
                $issue->save();

                $formatted = $this->issueService->formatIssue($issue->fresh(['lines', 'reconciliations']));
                ActualIssueHistory::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $chapterId,
                    'actual_issue_id' => $issue->id,
                    'version' => (int) $issue->version,
                    'material_version' => (int) $issue->material_version,
                    'event_type' => 'acknowledged',
                    'actor_user_id' => $userId,
                    'reason' => null,
                    'snapshot_json' => $formatted,
                    'created_at' => now(),
                ]);

                $this->outbox->recordIntent('stage1.actual-issue.changed.v1', $chapterId, $issue->id, $issue->version, $issue->material_version);

                $operationId = (string) Str::uuid();
                $response = [
                    'data' => $formatted,
                    'operation_id' => $operationId,
                    'operation_name' => 'matchActualIssueAcknowledgment',
                    'action_key' => $actionKey ?? $operationId,
                    'result' => $formatted,
                ];

                if (isset($binding)) {
                    $response = ['data' => [
                        'operation_id' => $operationId, 'operation_name' => 'matchActualIssueAcknowledgment',
                        'action_key' => $actionKey ?? $operationId, 'actor_id' => $userId, 'chapter_id' => $chapterId,
                        'committed_at' => now('UTC')->toISOString(), 'http_status' => 200,
                        'result' => [
                            'id' => $issue->id, 'chapter_id' => $chapterId, 'rf_id' => $issue->requisition_id,
                            'reference' => $issue->issue_number, 'version' => $issue->version,
                            'material_version' => $issue->material_version, 'status' => $issue->status,
                            'material' => $issue->material_json, 'snapshot' => $snapshot, 'acknowledgment' => $binding->match_projection,
                            'created_by' => ['user_id' => $issue->prepared_by_user_id, 'chapter_id' => $chapterId],
                            'created_at' => $issue->created_at->toISOString(), 'entered_at' => $issue->entered_at?->toISOString(),
                            'updated_at' => $issue->updated_at->toISOString(), 'handover_fence' => $issue->handover_fence,
                            'posting' => null, 'reconciliation' => null, 'setup_blockers' => [],
                        ],
                    ]];
                }

                if ($actionKey !== null) {
                    IdempotencyRecord::create([
                        'id' => $operationId,
                        'key' => $actionKey,
                        'chapter_id' => $chapterId,
                        'user_id' => $userId,
                        'operation_name' => 'matchActualIssueAcknowledgment',
                        'resource_id' => $issue->id,
                        'state' => 'committed',
                        'payload_hash' => CanonicalJson::sha256($request->all()),
                        'response_code' => 200,
                        'response_body' => json_encode($response),
                        'expires_at' => now()->addDays(7),
                    ]);
                }

                return response()->json($response, 200, ['Cache-Control' => 'no-store']);
            });
        } catch (ContractException $e) {
            return EnforceBrowserAuthority::error($e);
        }
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/post
     */
    public function post(Request $request, string $chapterId, string $issueId): JsonResponse
    {
        $issue = ActualIssue::with('lines')->where('chapter_id', $chapterId)->where('id', $issueId)->first();
        if (! $issue) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Actual issue not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        try {
            $result = $this->issueService->postActualIssueBatch(
                $issue,
                $this->actorId($request),
                $request->all(),
                $this->actionKey($request)
            );

            return response()->json($result, 200, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return EnforceBrowserAuthority::error($e);
        }
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/history
     */
    public function history(string $chapterId, string $issueId): JsonResponse
    {
        $issue = ActualIssue::where('chapter_id', $chapterId)->where('id', $issueId)->first();
        if (! $issue) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Actual issue not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $history = ActualIssueHistory::where('chapter_id', $chapterId)
            ->where('actual_issue_id', $issueId)
            ->orderBy('version')
            ->get();

        return response()->json([
            'data' => $history->map(fn (ActualIssueHistory $h) => [
                'id' => $h->id,
                'actual_issue_id' => $h->actual_issue_id,
                'version' => $h->version,
                'material_version' => $h->material_version,
                'event_type' => $h->event_type,
                'actor_id' => $h->actor_user_id,
                'reason' => $h->reason,
                'snapshot' => $h->snapshot_json,
                'created_at' => $h->created_at?->format('Y-m-d\TH:i:s.u\Z'),
            ])->values(),
            'page' => ['has_more' => false, 'next_cursor' => null, 'total_elements' => $history->count()],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/movements
     */
    public function movements(string $chapterId, string $issueId): JsonResponse
    {
        $issue = ActualIssue::where('chapter_id', $chapterId)->where('id', $issueId)->first();
        if (! $issue) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Actual issue not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $movements = $issue->inventory_posting_id
            ? InventoryMovement::where('chapter_id', $chapterId)->where('posting_id', $issue->inventory_posting_id)->get()
            : collect();

        return response()->json([
            'data' => $movements,
            'page' => ['has_more' => false, 'next_cursor' => null, 'total_elements' => $movements->count()],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/related
     */
    public function related(string $chapterId, string $issueId): JsonResponse
    {
        $issue = ActualIssue::with(['lines', 'reconciliations'])
            ->where('chapter_id', $chapterId)
            ->where('id', $issueId)
            ->first();

        if (! $issue) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Actual issue not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $rf = InternalRf::where('chapter_id', $chapterId)->where('id', $issue->requisition_id)->with('lines')->first();
        $resIds = $issue->lines->pluck('reservation_id')->filter()->unique()->values()->all();
        $reservations = empty($resIds)
            ? collect()
            : StockReservation::where('chapter_id', $chapterId)->whereIn('id', $resIds)->with('allocations')->get();
        $lotIds = $issue->lines->pluck('lot_id')->filter()->unique()->values()->all();
        $lots = empty($lotIds)
            ? collect()
            : InventoryLot::where('chapter_id', $chapterId)->whereIn('id', $lotIds)->get();
        $evidenceBinding = $issue->evidence_binding_id
            ? EvidenceBinding::where('chapter_id', $chapterId)->where('id', $issue->evidence_binding_id)->first()
            : null;
        $posting = $issue->inventory_posting_id
            ? InventoryPosting::where('chapter_id', $chapterId)->where('id', $issue->inventory_posting_id)->first()
            : null;
        $movements = $posting
            ? InventoryMovement::where('chapter_id', $chapterId)->where('posting_id', $posting->id)->get()
            : collect();
        $handover = Handover::where('chapter_id', $chapterId)
            ->where('source_type', 'REQUISITION')
            ->where('source_id', $issue->requisition_id)
            ->with(['lines', 'receipts'])
            ->first();

        return response()->json([
            'data' => [
                'issue' => $this->issueService->formatIssue($issue),
                'rf' => $rf ? $this->rfService->formatRf($rf) : null,
                'reservations' => $reservations,
                'lots' => $lots,
                'evidence_binding' => $evidenceBinding,
                'posting' => $posting,
                'movements' => $movements,
                'handover' => $handover,
                'reconciliations' => $issue->reconciliations,
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * POST /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/reconciliations
     */
    public function reconciliations(Request $request, string $chapterId, string $issueId): JsonResponse
    {
        $authActor = $request->user()->id;
        $actionKey = $this->actionKey($request);

        try {
            return DB::transaction(function () use ($request, $chapterId, $issueId, $authActor, $actionKey) {
                $issue = ActualIssue::where('chapter_id', $chapterId)
                    ->where('id', $issueId)
                    ->lockForUpdate()
                    ->first();

                if (! $issue) {
                    throw new ContractException(404, 'resource_not_found', 'Actual issue not found.');
                }

                if ($request->has('expected_version') && (int) $request->input('expected_version') !== (int) ($issue->version ?? 1)) {
                    throw new ContractException(409, 'version_conflict', 'expected_version mismatch.', [
                        'failed_intent_committed' => false,
                        'current' => $this->issueService->formatIssue($issue),
                    ]);
                }

                $validated = $request->validate([
                    'finding' => 'required|string|in:no_handover,handed_over_unposted,committed,disputed',
                    'notes' => 'nullable|string',
                    'reason' => 'nullable|string',
                    'officer_user_id' => 'nullable|string',
                    'reconciled_at' => 'nullable',
                ]);

                $finding = $validated['finding'];

                // Strict state machine for all 4 reconciliation findings
                if ($finding === 'committed' && ($issue->status !== 'posted' || ! $issue->inventory_posting_id)) {
                    throw new ContractException(409, 'handover_unresolved', 'Cannot record committed reconciliation when actual issue has not been posted.', [
                        'failed_intent_committed' => false,
                        'current' => $this->issueService->formatIssue($issue),
                    ]);
                }

                if (in_array($finding, ['no_handover', 'handed_over_unposted'], true) && $issue->status === 'posted') {
                    throw new ContractException(409, 'already_posted', "Cannot record '{$finding}' reconciliation on an already posted issue.", [
                        'failed_intent_committed' => false,
                        'current' => $this->issueService->formatIssue($issue),
                    ]);
                }

                $rfExists = InternalRf::where('chapter_id', $chapterId)
                    ->where('id', $issue->requisition_id)
                    ->exists();

                if ($finding === 'handed_over_unposted' && ($issue->handover_fence === 'disputed' || ($rfExists && ! $issue->evidence_binding_id && ! $request->has('evidence')))) {
                    throw new ContractException(409, 'handover_unresolved', 'Cannot authorize retry without an active matched acknowledgment and non-disputed fence.', [
                        'failed_intent_committed' => false,
                        'current' => $this->issueService->formatIssue($issue),
                    ]);
                }

                $officerId = $authActor;
                $notes = $validated['notes'] ?? $validated['reason'] ?? null;

                $reconciliation = IssueReconciliation::create([
                    'chapter_id' => $chapterId,
                    'actual_issue_id' => $issue->id,
                    'officer_user_id' => $officerId,
                    'finding' => $finding,
                    'notes' => $notes,
                    'reconciled_at' => $validated['reconciled_at'] ?? now(),
                ]);

                if ($finding === 'no_handover') {
                    if ($issue->evidence_binding_id) {
                        EvidenceBinding::where('id', $issue->evidence_binding_id)
                            ->update(['status' => 'invalidated']);
                    }
                    $issue->evidence_binding_id = null;
                    $issue->matched_at = null;
                    $issue->matched_by_user_id = null;
                    $issue->status = 'prepared';
                    $issue->handover_fence = 'none';
                } elseif ($finding === 'handed_over_unposted') {
                    $issue->handover_fence = 'retry_authorized';
                } elseif ($finding === 'disputed') {
                    $issue->handover_fence = 'disputed';
                } elseif ($finding === 'committed') {
                    $issue->handover_fence = 'committed';
                }
                $issue->version = ((int) ($issue->version ?? 1)) + 1;
                $issue->save();

                $formattedIssue = $this->issueService->formatIssue($issue->fresh(['lines', 'reconciliations']));
                ActualIssueHistory::create([
                    'id' => (string) Str::uuid(),
                    'chapter_id' => $chapterId,
                    'actual_issue_id' => $issue->id,
                    'version' => (int) $issue->version,
                    'material_version' => (int) $issue->material_version,
                    'event_type' => "reconciliation_{$finding}",
                    'actor_user_id' => $officerId,
                    'reason' => $notes,
                    'snapshot_json' => $formattedIssue,
                    'created_at' => now(),
                ]);

                $this->outbox->recordIntent('stage1.actual-issue.changed.v1', $chapterId, $issue->id, $issue->version, $issue->material_version);

                $operationId = (string) Str::uuid();
                $response = [
                    'data' => $reconciliation,
                    'issue' => $formattedIssue,
                    'operation_id' => $operationId,
                ];

                if ($actionKey !== null) {
                    IdempotencyRecord::create([
                        'id' => $operationId,
                        'key' => $actionKey,
                        'chapter_id' => $chapterId,
                        'user_id' => $officerId,
                        'operation_name' => 'recordIssueReconciliation',
                        'resource_id' => $issue->id,
                        'state' => 'committed',
                        'payload_hash' => CanonicalJson::sha256($request->all()),
                        'response_code' => 201,
                        'response_body' => json_encode($response),
                        'expires_at' => now()->addDays(7),
                    ]);
                }

                return response()->json($response, 201, ['Cache-Control' => 'no-store']);
            });
        } catch (ContractException $e) {
            return response()->json($e->toArray(), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/reconciliation
     */
    public function showReconciliation(string $chapterId, string $issueId): JsonResponse
    {
        $issue = ActualIssue::where('chapter_id', $chapterId)->where('id', $issueId)->first();
        if (! $issue) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Actual issue not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $reconciliations = IssueReconciliation::where('chapter_id', $chapterId)
            ->where('actual_issue_id', $issueId)
            ->latest()
            ->get();

        return response()->json(['data' => $reconciliations], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issue-operations/by-key
     */
    public function operationsByKey(Request $request, string $chapterId): JsonResponse
    {
        $key = $request->query('action_key') ?? $request->query('key') ?? $request->header('X-Action-Key');
        if (! $key) {
            return response()->json([
                'error' => ['code' => 'MISSING_KEY', 'message' => 'action_key or key query parameter is required.'],
            ], 400, ['Cache-Control' => 'no-store']);
        }

        $actorId = $request->user()->id;
        $query = IdempotencyRecord::where('key', $key)->where('chapter_id', $chapterId);
        if ($actorId) {
            $query->where('user_id', $actorId);
        }

        $record = $query->first();
        if (! $record || ! $this->canReadReceipt($request, $record)) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Operation not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        if ($record->state === 'in_flight') {
            return response()->json([
                'error' => ['code' => 'OPERATION_IN_FLIGHT', 'message' => 'Operation is currently in flight.'],
            ], 409, ['Cache-Control' => 'no-store']);
        }

        $decoded = json_decode($record->response_body, true);

        return response()->json($decoded ?? $record->response_body, $record->response_code, [
            'X-Action-Replayed' => 'true',
            'Cache-Control' => 'no-store',
        ]);
    }

    /**
     * GET /api/v1/chapters/{chapter_id}/actual-issue-operations/{operation_id}
     */
    public function operationsById(Request $request, string $chapterId, string $operationId): JsonResponse
    {
        $actorId = $request->user()->id;
        $query = IdempotencyRecord::where('id', $operationId)->where('chapter_id', $chapterId);
        if ($actorId) {
            $query->where('user_id', $actorId);
        }

        $record = $query->first();
        if (! $record || ! $this->canReadReceipt($request, $record)) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Operation not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $decoded = json_decode($record->response_body, true);

        return response()->json($decoded ?? $record->response_body, $record->response_code, [
            'Cache-Control' => 'no-store',
        ]);
    }

    private function canReadReceipt(Request $request, IdempotencyRecord $record): bool
    {
        $origin = match ($record->operation_name) {
            'prepareActualIssue', 'reviseActualIssue' => 'issue.prepare',
            'matchActualIssueAcknowledgment', 'postActualIssue', 'recordIssueReconciliation' => 'issue.post',
            default => null,
        };
        if ($origin === null || ! $record->resource_id) {
            return false;
        }

        $authority = $request->attributes->get(ChapterAuthority::class);
        $issue = ActualIssue::where('chapter_id', $record->chapter_id)->whereKey($record->resource_id)->first();
        $rf = $issue?->rf()->where('chapter_id', $record->chapter_id)->first();
        if (! $rf || ! $authority->canReadRf($rf)) {
            return false;
        }
        foreach ([$origin, 'issue.prepare', 'stock.read', 'evidence.read', 'history.read'] as $action) {
            if (! $authority->allows($action, $rf->requesting_unit_id)) {
                return false;
            }
        }

        return true;
    }

    private function validateDisjointLineTargets(array $rawLines): void
    {
        $allTargets = [];

        foreach ($rawLines as $line) {
            if (empty($line['targets']) || ! is_array($line['targets'])) {
                continue;
            }

            foreach ($line['targets'] as $tIdx => $target) {
                if (! is_string($target['quantity'] ?? null) || ! preg_match('/^\d+(?:\.\d{1,6})?$/', $target['quantity'])) {
                    throw new ContractException(422, 'invalid_input', "Target {$tIdx} quantity must be a decimal string.");
                }
                if (isset($target['offset_quantity']) && (! is_string($target['offset_quantity']) || ! preg_match('/^\d+(?:\.\d{1,6})?$/', $target['offset_quantity']))) {
                    throw new ContractException(422, 'invalid_input', "Target {$tIdx} offset_quantity must be a decimal string.");
                }

                $allTargets[] = $target;
            }
        }

        if (! empty($allTargets)) {
            BcMath::assertDisjointIntervals($allTargets);
        }
    }

    private function buildMaterialSnapshot(
        string $chapterId,
        string $issueId,
        string $issueNumber,
        array $seq,
        ?InternalRf $rf,
        string $actorId,
        ?string $recipientId,
        string $recipientName,
        array $lines,
        ?string $handedOverAt,
        ?string $acknowledgedAt,
        bool $acceptsPartial,
        int $materialVersion = 1
    ): array {
        return [
            'chapter_id' => $chapterId,
            'issue_id' => $issueId,
            'reference' => $issueNumber,
            'reference_policy_id' => $seq['policy_id'] ?? null,
            'reference_policy_version' => $seq['policy_version'] ?? null,
            'material_version' => $materialVersion,
            'rf_id' => $rf?->id,
            'rf_reference' => $rf?->rf_number,
            'rf_material_version' => $rf?->material_version,
            'issuing_officer' => $actorId,
            'recipient' => [
                'recipient_id' => $recipientId,
                'recipient_name' => $recipientName,
            ],
            'lines' => $lines,
            'handed_over_at' => $handedOverAt,
            'acknowledged_at' => $acknowledgedAt,
            'recipient_accepts_partial' => $acceptsPartial,
        ];
    }

    private function actorId(Request $request): string
    {
        return (string) ($request->user()->id);
    }

    private function actionKey(Request $request): ?string
    {
        return $request->header('Idempotency-Key')
            ?? $request->header('X-Action-Key')
            ?? $request->header('X-Idempotency-Key');
    }
}
