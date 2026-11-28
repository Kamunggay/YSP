<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Middleware\EnforceBrowserAuthority;
use App\Http\Requests\AuthInput;
use App\Models\IdempotencyRecord;
use App\Models\InternalRf;
use App\Models\InventoryLot;
use App\Models\RfReservationHistory;
use App\Models\RfReservationPreparation;
use App\Models\StockHold;
use App\Models\StockHoldHistory;
use App\Models\StockReservation;
use App\Services\Authority\ChapterAuthority;
use App\Services\Inventory\AllocationQueueQueryService;
use App\Services\Inventory\InternalRfService;
use App\Services\Inventory\ReservationService;
use App\Services\Inventory\StockViewQueryService;
use App\Services\Shared\BcMath;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ReservationAndHoldController extends Controller
{
    public function __construct(
        protected ReservationService $reservationService,
        protected InternalRfService $rfService,
        protected StockViewQueryService $stockViewService
    ) {}

    public function prepareRfReservation(Request $request, string $chapterId, string $rfId): JsonResponse
    {
        try {
            $envelope = $this->reservationService->prepareReservation(
                $chapterId,
                $rfId,
                $this->actorId($request),
                $request->all(),
                $this->actionKey($request)
            );

            return response()->json($envelope, 201, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return response()->json($e->toArray(), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    public function readRfReservationPreparation(string $chapterId, string $rfId, string $preparationId): JsonResponse
    {
        $prep = RfReservationPreparation::where('chapter_id', $chapterId)
            ->where('rf_id', $rfId)
            ->where('id', $preparationId)
            ->first();

        if (! $prep) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Reservation preparation not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        return response()->json([
            'data' => $this->reservationService->formatPreparation($prep),
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function commitRfReservation(Request $request, string $chapterId, string $rfId, string $preparationId): JsonResponse
    {
        try {
            $envelope = $this->reservationService->commitReservation(
                $chapterId,
                $rfId,
                $preparationId,
                $this->actorId($request),
                $request->all(),
                $this->actionKey($request)
            );

            return response()->json($envelope, 201, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return response()->json($e->toArray(isset($e->extra['setup_blockers']) ? (string) Str::uuid() : null), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    public function listRfReservations(string $chapterId, string $rfId): JsonResponse
    {
        $rf = InternalRf::where('chapter_id', $chapterId)->where('id', $rfId)->first();
        if (! $rf) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => "Internal RF {$rfId} not found."],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $reservations = StockReservation::where('chapter_id', $chapterId)
            ->where('source_type', 'RF')
            ->where('source_id', $rfId)
            ->with('allocations')
            ->orderByDesc('created_at')
            ->get();

        $data = $reservations->map(fn (StockReservation $r) => $this->reservationService->formatReservation($r))->values();

        return response()->json([
            'data' => $data,
            'page' => ['has_more' => false, 'next_cursor' => null, 'total_elements' => $data->count()],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function readRfReservation(string $chapterId, string $rfId, string $reservationId): JsonResponse
    {
        $reservation = StockReservation::where('chapter_id', $chapterId)
            ->where('source_type', 'RF')
            ->where('source_id', $rfId)
            ->where('id', $reservationId)
            ->with('allocations')
            ->first();

        if (! $reservation) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => "Reservation {$reservationId} not found."],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        return response()->json([
            'data' => $this->reservationService->formatReservation($reservation),
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function listRfReservationHistory(string $chapterId, string $rfId, string $reservationId): JsonResponse
    {
        $reservation = StockReservation::where('chapter_id', $chapterId)
            ->where('source_type', 'RF')
            ->where('source_id', $rfId)
            ->where('id', $reservationId)
            ->first();

        if (! $reservation) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => "Reservation {$reservationId} not found."],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $history = RfReservationHistory::where('chapter_id', $chapterId)
            ->where('reservation_id', $reservationId)
            ->orderBy('version')
            ->get();

        return response()->json([
            'data' => $history->map(fn (RfReservationHistory $h) => [
                'id' => $h->id,
                'reservation_id' => $h->reservation_id,
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

    public function releaseRfReservation(Request $request, string $chapterId, string $rfId, string $reservationId): JsonResponse
    {
        try {
            $envelope = $this->reservationService->releaseReservation(
                $chapterId,
                $rfId,
                $reservationId,
                $this->actorId($request),
                $request->all(),
                $this->actionKey($request)
            );

            return response()->json($envelope, 200, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return response()->json($e->toArray(), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    public function reallocateRfReservation(Request $request, string $chapterId, string $rfId, string $reservationId): JsonResponse
    {
        try {
            $envelope = $this->reservationService->reallocateReservation(
                $chapterId,
                $rfId,
                $reservationId,
                $this->actorId($request),
                $request->all(),
                $this->actionKey($request)
            );

            return response()->json($envelope, 200, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return response()->json($e->toArray(isset($e->extra['setup_blockers']) ? (string) Str::uuid() : null), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    public function readRfAllocationReview(Request $request, string $chapterId, string $rfId): JsonResponse
    {
        $rf = InternalRf::where('chapter_id', $chapterId)->whereKey($rfId)->with('lines')->firstOrFail();
        $lineId = $request->query('rf_line_id');
        if ($lineId !== null && (! is_string($lineId) || preg_match(AuthInput::UUID, $lineId) !== 1)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid RF line selector.');
        }
        if ($lineId !== null && ($rf->status !== 'approved' || ! $rf->lines->contains('id', $lineId))) {
            throw new ContractException(404, 'resource_not_found', 'Resource not found.');
        }

        $observedAt = now('UTC');
        $formattedRf = $this->rfService->formatRf($rf);
        $lineReviews = [];
        foreach ($rf->lines as $line) {
            if ($lineId !== null && $line->id !== $lineId) {
                continue;
            }

            $candidateLots = [];
            if ($rf->status === 'approved') {
                $lots = InventoryLot::where('chapter_id', $chapterId)->where('variant_id', $line->variant_id)
                    ->where('unit_id', $line->unit_id)->where('condition', 'USABLE')->where('custody', 'STOCKROOM')
                    ->withExists('restrictions')->orderBy('created_at')->orderBy('id')->get();
                $lotRanges = $this->stockViewService->loadLotRanges($lots);
                foreach ($lots as $lot) {
                    $ranges = $lotRanges[$lot->id];
                    $available = $this->stockViewService->getLotAvailability($lot, $observedAt, $rf->purpose, $rf, ranges: $ranges);
                    if (BcMath::isPositive($available['eligible_free_quantity'])) {
                        $candidateLots[] = [
                            'stock_lot_id' => $lot->id,
                            'basis_segment_id' => $lot->basis_segment_id ?? $lot->id,
                            'quantity_on_hand' => $lot->quantity_on_hand,
                            'stock_version' => $lot->stock_version,
                            'material_version' => $lot->material_version,
                            'active_holds' => $ranges['holds'],
                            'active_reservations' => $ranges['reservations'],
                            'free_intervals' => $available['free_intervals'],
                        ];
                    }
                }
            }

            if ($lineId !== null) {
                $progress = collect($formattedRf['lines'])->firstWhere('id', $lineId)['progress'];
                $free = '0';
                foreach ($candidateLots as $lot) {
                    foreach ($lot['free_intervals'] as $range) {
                        $free = BcMath::add($free, $range['quantity']);
                    }
                }
                $scale = (int) ($line->identity_at_approval['quantity_scale'] ?? 0);
                $policy = null;
                $blockers = [];
                $demands = [];
                $authority = $request->attributes->get(ChapterAuthority::class);
                try {
                    $queue = app(AllocationQueueQueryService::class)->buildQueue($authority, [
                        'variant_id' => $line->variant_id,
                        'eligible_only' => false,
                    ]);
                    $reference = $queue['allocation_policy'];
                    $policyRecord = $authority->chapter->policyRecords()->where('policy_code', 'allocation_priority')
                        ->where('aggregate_id', $reference['policy_id'])->where('policy_version', $reference['version'])->first();
                    $approval = collect($policyRecord?->setupEvidence()['approvals'] ?? [])->firstWhere('authority', 'CHAPTER_HEAD');
                    if ($approval && isset($approval['id'], $approval['approver_id'])) {
                        $policy = [
                            'policy_id' => $reference['policy_id'],
                            'material_version' => $reference['version'],
                            'approval_id' => $approval['id'],
                            'approved_by' => $approval['approver_id'],
                        ];
                    }
                    foreach (array_slice($queue['entries'], 0, 100) as $demand) {
                        $demands[] = [
                            'rf_id' => $demand['rf_id'],
                            'rf_line_id' => $demand['rf_line_id'],
                            'priority_rank' => $demand['priority_rank'],
                            'needed_at' => $demand['needed_at'],
                            'approved_at' => $demand['approved_at'],
                            'unreserved_quantity' => $demand['unreserved_outstanding_quantity'],
                        ];
                    }
                } catch (ContractException $exception) {
                    if ($exception->errorCode !== 'setup_blocked') {
                        throw $exception;
                    }
                    $blockers = $exception->extra['blockers'] ?? [];
                }

                return response()->json(['data' => [
                    'rf_id' => $rfId,
                    'rf_line_id' => $lineId,
                    'rf_version' => $rf->version,
                    'rf_material_version' => $rf->material_version,
                    'rf_progress_version' => $rf->progress_version,
                    'progress' => $progress,
                    'free_eligible_quantity' => BcMath::format($free, $scale),
                    'uncovered_quantity' => BcMath::format(BcMath::max('0', BcMath::sub($progress['unreserved_quantity'], $free)), $scale),
                    'allocation_policy' => $policy,
                    'ordered_demands' => $demands,
                    'queue_next_cursor' => null,
                    'setup_blockers' => $blockers,
                    'observed_at' => $observedAt->format('Y-m-d\TH:i:s.u\Z'),
                    'is_commit_authorization' => false,
                ]], 200, ['Cache-Control' => 'no-store']);
            }

            $lineReviews[] = [
                'rf_line_id' => $line->id,
                'variant_id' => $line->variant_id,
                'unit_id' => $line->unit_id,
                'views' => $this->stockViewService->getSevenViews($chapterId, $line->variant_id, $line->identity_at_approval['quantity_scale'] ?? 0),
                'candidate_lots' => $candidateLots,
            ];
        }

        return response()->json([
            'data' => [
                'rf' => $formattedRf,
                'observed_at' => $observedAt->format('Y-m-d\TH:i:s.u\Z'),
                'lines' => $lineReviews,
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function listStockHolds(Request $request, string $chapterId): JsonResponse
    {
        $query = StockHold::where('chapter_id', $chapterId)->with('ranges');
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        $holds = $query->orderByDesc('placed_at')->get();
        $data = $holds->map(fn (StockHold $h) => $this->reservationService->formatHold($h))->values();

        return response()->json([
            'data' => $data,
            'page' => ['has_more' => false, 'next_cursor' => null, 'total_elements' => $data->count()],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function placeStockHold(Request $request, string $chapterId): JsonResponse
    {
        try {
            $envelope = $this->reservationService->placeHold(
                $chapterId,
                $this->actorId($request),
                $request->all(),
                $this->actionKey($request)
            );

            return response()->json($envelope, 201, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return response()->json($e->toArray(), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    public function readStockHold(string $chapterId, string $holdId): JsonResponse
    {
        $hold = StockHold::where('chapter_id', $chapterId)->where('id', $holdId)->with('ranges')->first();
        if (! $hold) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => "Stock hold {$holdId} not found."],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        return response()->json([
            'data' => $this->reservationService->formatHold($hold),
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function listStockHoldHistory(string $chapterId, string $holdId): JsonResponse
    {
        $hold = StockHold::where('chapter_id', $chapterId)->where('id', $holdId)->first();
        if (! $hold) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => "Stock hold {$holdId} not found."],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $history = StockHoldHistory::where('chapter_id', $chapterId)
            ->where('hold_id', $holdId)
            ->orderBy('version')
            ->get();

        return response()->json([
            'data' => $history->map(fn (StockHoldHistory $h) => [
                'id' => $h->id,
                'hold_id' => $h->hold_id,
                'version' => $h->version,
                'material_version' => $h->material_version,
                'event_type' => $h->event_type,
                'actor_id' => $h->actor_user_id,
                'snapshot' => $h->snapshot_json,
                'created_at' => $h->created_at?->format('Y-m-d\TH:i:s.u\Z'),
            ])->values(),
            'page' => ['has_more' => false, 'next_cursor' => null, 'total_elements' => $history->count()],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function proposeStockHoldClearance(Request $request, string $chapterId, string $holdId): JsonResponse
    {
        try {
            $envelope = $this->reservationService->proposeHoldClearance(
                $chapterId,
                $holdId,
                $this->actorId($request),
                $request->all(),
                $this->actionKey($request)
            );

            return response()->json($envelope, 200, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return response()->json($e->toArray(), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    public function clearStockHold(Request $request, string $chapterId, string $holdId): JsonResponse
    {
        try {
            $envelope = $this->reservationService->clearHold(
                $chapterId,
                $holdId,
                $this->actorId($request),
                $request->all(),
                $this->actionKey($request)
            );

            return response()->json($envelope, 200, ['Cache-Control' => 'no-store']);
        } catch (ContractException $e) {
            return EnforceBrowserAuthority::error($e);
        }
    }

    public function findReservationOperation(Request $request, string $chapterId): JsonResponse
    {
        $key = $request->query('action_key') ?? $request->query('key') ?? $request->header('X-Action-Key');
        if (! $key) {
            return response()->json([
                'error' => ['code' => 'missing_key', 'message' => 'action_key is required.'],
            ], 400, ['Cache-Control' => 'no-store']);
        }

        $actorId = $request->user()->id;
        $query = IdempotencyRecord::where('chapter_id', $chapterId)->where('key', $key);
        if ($actorId) {
            $query->where('user_id', $actorId);
        }

        $record = $query->first();
        if (! $record || ! $this->canReadReceipt($request, $record)) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Operation result not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        if ($record->state === 'in_flight') {
            return response()->json([
                'error' => ['code' => 'operation_in_flight', 'message' => 'Operation is in flight.'],
            ], 409, ['Cache-Control' => 'no-store']);
        }

        $decoded = json_decode($record->response_body, true);

        return response()->json($decoded ?? ['data' => $record->response_body], 200, ['Cache-Control' => 'no-store']);
    }

    public function readReservationOperation(Request $request, string $chapterId, string $operationId): JsonResponse
    {
        $actorId = $request->user()->id;
        $query = IdempotencyRecord::where('chapter_id', $chapterId)->where('id', $operationId);
        if ($actorId) {
            $query->where('user_id', $actorId);
        }

        $record = $query->first();
        if (! $record || ! $this->canReadReceipt($request, $record)) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => 'Operation result not found.'],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $decoded = json_decode($record->response_body, true);

        return response()->json($decoded ?? ['data' => $record->response_body], 200, ['Cache-Control' => 'no-store']);
    }

    private function canReadReceipt(Request $request, IdempotencyRecord $record): bool
    {
        $action = match ($record->operation_name) {
            'prepareRfReservation', 'commitRfReservation', 'releaseRfReservation' => 'rf.reserve',
            'reallocateRfReservation' => 'rf.reallocate',
            'placeStockHold' => 'hold.place',
            'proposeStockHoldClearance', 'clearStockHold' => 'hold.clear',
            default => null,
        };
        if ($action === null) {
            return false;
        }

        $authority = $request->attributes->get(ChapterAuthority::class);
        if (str_starts_with($action, 'hold.')) {
            return $authority->allows('stock.read') && $authority->allows($action)
                && ($record->operation_name !== 'clearStockHold' || $authority->allows('evidence.read'));
        }

        $rfId = data_get(json_decode($record->response_body, true), 'data.result.rf_id');
        $rf = InternalRf::where('chapter_id', $record->chapter_id)->whereKey($rfId)->first();

        return $rf && $authority->canReadRf($rf)
            && $authority->allows('stock.read', $rf->requesting_unit_id)
            && $authority->allows($action, $rf->requesting_unit_id);
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
