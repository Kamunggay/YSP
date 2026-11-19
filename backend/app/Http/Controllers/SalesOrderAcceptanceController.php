<?php

namespace App\Http\Controllers;

use App\Models\SalesOrder;
use App\Services\Sales\DemandSplitterService;
use App\Services\Sales\SalesOrderAcceptanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SalesOrderAcceptanceController extends Controller
{
    public function __construct(
        protected SalesOrderAcceptanceService $acceptanceService,
        protected DemandSplitterService $demandSplitterService
    ) {}

    /**
     * Record a customer contact interaction.
     */
    public function recordCustomerContact(Request $request, string $chapterId, string $soId): JsonResponse
    {
        $salesOrder = SalesOrder::where('chapter_id', $chapterId)
            ->where('id', $soId)
            ->firstOrFail();

        $validated = $request->validate([
            'contact_method' => ['required', 'string', Rule::in(['PHONE', 'EMAIL', 'IN_PERSON'])],
            'officer_id' => ['required', 'string'],
            'buyer_response' => ['required', 'string'],
            'contact_timestamp' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        $log = $this->acceptanceService->recordCustomerContact($salesOrder, $validated);

        return response()->json([
            'data' => $log,
            'message' => 'Customer contact log recorded successfully.',
        ], 201);
    }

    /**
     * Record buyer acceptance or decline of order terms.
     */
    public function recordBuyerAcceptance(Request $request, string $chapterId, string $soId): JsonResponse
    {
        $salesOrder = SalesOrder::where('chapter_id', $chapterId)
            ->where('id', $soId)
            ->firstOrFail();

        $validated = $request->validate([
            'acceptance_status' => [
                'required_without_all:buyer_acceptance_status,status',
                'string',
            ],
            'buyer_acceptance_status' => ['nullable', 'string'],
            'status' => ['nullable', 'string'],
            'reason' => ['nullable', 'string'],
            'officer_id' => ['nullable', 'string'],
        ]);

        $status = $validated['acceptance_status']
            ?? $validated['buyer_acceptance_status']
            ?? $validated['status'];

        if (! in_array($status, SalesOrderAcceptanceService::ALLOWED_STATUSES, true)) {
            return response()->json([
                'message' => "Invalid buyer acceptance status: {$status}. Allowed values: ".implode(', ', SalesOrderAcceptanceService::ALLOWED_STATUSES),
            ], 422);
        }

        $updated = $this->acceptanceService->recordBuyerAcceptance(
            $salesOrder,
            $status,
            $validated['reason'] ?? null,
            $validated['officer_id'] ?? null
        );

        return response()->json([
            'data' => $updated,
            'message' => 'Buyer acceptance recorded successfully.',
        ]);
    }

    /**
     * Check available stock and split order demand into reserved and backordered units.
     */
    public function splitDemand(Request $request, string $chapterId, string $soId): JsonResponse
    {
        $salesOrder = SalesOrder::with('lines')
            ->where('chapter_id', $chapterId)
            ->where('id', $soId)
            ->firstOrFail();

        $validated = $request->validate([
            'available_stock' => ['nullable', 'array'],
            'available_stock_by_variant' => ['nullable', 'array'],
        ]);

        $stockMap = $validated['available_stock']
            ?? $validated['available_stock_by_variant']
            ?? [];

        $summary = $this->demandSplitterService->checkAndSplitDemand($salesOrder, $stockMap);

        return response()->json([
            'data' => $salesOrder->fresh(['lines', 'reservations']),
            'summary' => $summary,
            'message' => 'Demand split completed successfully.',
        ]);
    }
}
