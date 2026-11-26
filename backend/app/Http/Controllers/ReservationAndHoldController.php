<?php

namespace App\Http\Controllers;

use App\Exceptions\ContractException;
use App\Http\Middleware\EnforceBrowserAuthority;
use App\Models\IdempotencyRecord;
use App\Models\InternalRf;
use App\Models\InventoryLot;
use App\Models\RfReservationHistory;
use App\Models\RfReservationPreparation;
use App\Models\StockHold;
use App\Models\StockHoldHistory;
use App\Models\StockReservation;
use App\Services\Authority\ChapterAuthority;
use App\Services\Inventory\InternalRfService;
use App\Services\Inventory\ReservationService;
use App\Services\Inventory\StockViewQueryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
            return response()->json($e->toArray(), $e->statusCode, ['Cache-Control' => 'no-store']);
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
            return response()->json($e->toArray(), $e->statusCode, ['Cache-Control' => 'no-store']);
        }
    }

    public function readRfAllocationReview(string $chapterId, string $rfId): JsonResponse
    {
        $rf = InternalRf::where('chapter_id', $chapterId)->where('id', $rfId)->with('lines')->first();
        if (! $rf) {
            return response()->json([
                'error' => ['code' => 'resource_not_found', 'message' => "Internal RF {$rfId} not found."],
            ], 404, ['Cache-Control' => 'no-store']);
        }

        $lineReviews = [];
        foreach ($rf->lines as $line) {
            $views = $this->stockViewService->getSevenViews($chapterId, $line->variant_id);
            $candidateLots = InventoryLot::where('chapter_id', $chapterId)
                ->where('variant_id', $line->variant_id)
                ->where('condition', 'USABLE')
                ->where('custody', 'STOCKROOM')
                ->orderBy('created_at')
                ->get()
                ->map(fn (InventoryLot $lot) => [
                    'stock_lot_id' => $lot->id,
                    'basis_segment_id' => $lot->basis_segment_id ?? $lot->id,
                    'quantity_on_hand' => $lot->quantity_on_hand,
                    'stock_version' => $lot->stock_version,
                    'material_version' => $lot->material_version,
                    'active_holds' => $this->stockViewService->getActiveHoldRangesForLot($chapterId, $lot->id),
                    'active_reservations' => $this->stockViewService->getActiveReservationRangesForLot($chapterId, $lot->id),
                ])
                ->values();

            $lineReviews[] = [
                'rf_line_id' => $line->id,
                'variant_id' => $line->variant_id,
                'unit_id' => $line->unit_id,
                'views' => $views,
                'candidate_lots' => $candidateLots,
            ];
        }

        return response()->json([
            'data' => [
                'rf' => $this->rfService->formatRf($rf),
                'observed_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
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
