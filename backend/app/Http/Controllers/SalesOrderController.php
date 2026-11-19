<?php

namespace App\Http\Controllers;

use App\Models\DutyGrant;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Models\SalesOrderRevision;
use App\Models\StockReservation;
use App\Services\Shared\BcMath;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class SalesOrderController extends Controller
{
    public function index(Request $request, string $chapterId): JsonResponse
    {
        $query = SalesOrder::query()
            ->with(['buyer', 'lines'])
            ->where('chapter_id', $chapterId);

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('buyer_id')) {
            $query->where('buyer_id', $request->input('buyer_id'));
        }

        if ($request->filled('date_from')) {
            $query->whereDate('order_date', '>=', $request->input('date_from'));
        } elseif ($request->filled('from_date')) {
            $query->whereDate('order_date', '>=', $request->input('from_date'));
        }

        if ($request->filled('date_to')) {
            $query->whereDate('order_date', '<=', $request->input('date_to'));
        } elseif ($request->filled('to_date')) {
            $query->whereDate('order_date', '<=', $request->input('to_date'));
        }

        $salesOrders = $query->orderByDesc('created_at')->get();

        return response()->json([
            'data' => $salesOrders,
        ]);
    }

    public function show(string $chapterId, string $id): JsonResponse
    {
        $salesOrder = SalesOrder::with(['buyer', 'lines', 'revisions'])
            ->where('chapter_id', $chapterId)
            ->where('id', $id)
            ->firstOrFail();

        return response()->json([
            'data' => $salesOrder,
        ]);
    }

    public function store(Request $request, string $chapterId): JsonResponse
    {
        $validated = $request->validate([
            'buyer_id' => [
                'required',
                'uuid',
                Rule::exists('buyers', 'id')->where('chapter_id', $chapterId),
            ],
            'order_date' => ['nullable', 'date'],
            'target_delivery_date' => ['required', 'date'],
            'terms_conditions' => ['nullable', 'string'],
            'terms_version' => ['nullable', 'integer'],
            'created_by' => ['required', 'string'],
            'so_number' => ['nullable', 'string', 'unique:sales_orders,so_number'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.variant_id' => ['required', 'string'],
            'lines.*.unit_id' => ['required', 'string'],
            'lines.*.ordered_quantity' => ['required', 'numeric', 'min:0.01'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
            'lines.*.material_version' => ['nullable', 'integer'],
        ]);

        $soNumber = $validated['so_number'] ?? $this->generateSoNumber($chapterId);

        $salesOrder = DB::transaction(function () use ($chapterId, $validated, $soNumber) {
            $so = SalesOrder::create([
                'chapter_id' => $chapterId,
                'so_number' => $soNumber,
                'buyer_id' => $validated['buyer_id'],
                'order_date' => $validated['order_date'] ?? now()->toDateString(),
                'target_delivery_date' => $validated['target_delivery_date'],
                'status' => 'DRAFT',
                'terms_conditions' => $validated['terms_conditions'] ?? null,
                'terms_version' => $validated['terms_version'] ?? 1,
                'version' => 1,
                'created_by' => $validated['created_by'],
            ]);

            foreach ($validated['lines'] as $lineData) {
                $orderedQty = (float) $lineData['ordered_quantity'];
                $unitPrice = (float) $lineData['unit_price'];
                $lineTotal = round($orderedQty * $unitPrice, 2);

                SalesOrderLine::create([
                    'so_id' => $so->id,
                    'variant_id' => $lineData['variant_id'],
                    'unit_id' => $lineData['unit_id'],
                    'ordered_quantity' => $orderedQty,
                    'unit_price' => $unitPrice,
                    'line_total' => $lineTotal,
                    'reserved_quantity' => 0,
                    'backordered_quantity' => 0,
                    'delivered_quantity' => 0,
                    'line_status' => 'ACTIVE',
                    'material_version' => $lineData['material_version'] ?? 1,
                ]);
            }

            return $so;
        });

        return response()->json([
            'data' => $salesOrder->load(['buyer', 'lines']),
            'message' => 'Sales order created successfully.',
        ], 201);
    }

    public function submit(Request $request, string $chapterId, string $id): JsonResponse
    {
        $salesOrder = SalesOrder::where('chapter_id', $chapterId)
            ->where('id', $id)
            ->firstOrFail();

        if (! in_array($salesOrder->status, ['DRAFT', 'RETURNED'], true)) {
            return response()->json([
                'message' => "Only DRAFT or RETURNED sales orders can be submitted. Current status: {$salesOrder->status}.",
            ], 422);
        }

        $salesOrder->update([
            'status' => 'SUBMITTED',
        ]);

        return response()->json([
            'data' => $salesOrder->fresh(['buyer', 'lines']),
            'message' => 'Sales order submitted successfully.',
        ]);
    }

    public function review(Request $request, string $chapterId, string $id): JsonResponse
    {
        $validated = $request->validate([
            'action' => ['required', 'string', 'in:APPROVE,RETURN,CANCEL'],
            'reviewer_id' => ['required', 'string'],
            'rejection_reason' => ['nullable', 'string', 'required_if:action,RETURN'],
        ]);

        $salesOrder = SalesOrder::where('chapter_id', $chapterId)
            ->where('id', $id)
            ->firstOrFail();

        if ($salesOrder->status !== 'SUBMITTED') {
            return response()->json([
                'message' => "Only SUBMITTED sales orders can be reviewed. Current status: {$salesOrder->status}.",
            ], 422);
        }

        $action = $validated['action'];
        $reviewerId = $validated['reviewer_id'];

        if ($action === 'APPROVE') {
            if ($salesOrder->created_by === $reviewerId) {
                $now = now();
                $hasAlternateGrant = DutyGrant::where('chapter_id', $chapterId)
                    ->where('user_id', $reviewerId)
                    ->where('status', 'active')
                    ->where('is_alternate', true)
                    ->whereIn('duty_code', ['SALES_REVIEWER', 'SALES_OFFICER', 'CHAPTER_HEAD'])
                    ->get()
                    ->contains(function (DutyGrant $grant) use ($now): bool {
                        if ($grant->valid_from && $grant->valid_from->isAfter($now)) {
                            return false;
                        }
                        if ($grant->valid_until && $grant->valid_until->isBefore($now)) {
                            return false;
                        }

                        return true;
                    });

                if (! $hasAlternateGrant) {
                    return response()->json([
                        'message' => 'Self-approval is forbidden under GOV-05 and SO-02.',
                    ], 403);
                }
            }

            $salesOrder->update([
                'status' => 'APPROVED',
                'approved_by' => $reviewerId,
                'rejection_reason' => null,
            ]);
        } elseif ($action === 'RETURN') {
            $salesOrder->update([
                'status' => 'RETURNED',
                'rejection_reason' => $validated['rejection_reason'],
            ]);
        } elseif ($action === 'CANCEL') {
            DB::transaction(function () use ($salesOrder, $validated) {
                $salesOrder->update([
                    'status' => 'CANCELLED',
                    'rejection_reason' => $validated['rejection_reason'] ?? $salesOrder->rejection_reason,
                ]);
                $salesOrder->lines()->update(['line_status' => 'CANCELLED']);
            });
        }

        return response()->json([
            'data' => $salesOrder->fresh(['buyer', 'lines']),
            'message' => "Sales order review completed with action: {$action}.",
        ]);
    }

    public function revise(Request $request, string $chapterId, string $id): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['nullable', 'string'],
            'created_by' => ['nullable', 'string'],
            'target_delivery_date' => ['nullable', 'date'],
            'terms_conditions' => ['nullable', 'string'],
            'status' => ['nullable', 'string', 'in:SUBMITTED,DRAFT'],
            'lines' => ['nullable', 'array', 'min:1'],
            'lines.*.variant_id' => ['required_with:lines', 'string'],
            'lines.*.unit_id' => ['required_with:lines', 'string'],
            'lines.*.ordered_quantity' => ['required_with:lines', 'numeric', 'min:0.01'],
            'lines.*.unit_price' => ['required_with:lines', 'numeric', 'min:0'],
            'lines.*.material_version' => ['nullable', 'integer'],
        ]);

        $salesOrder = SalesOrder::with('lines')
            ->where('chapter_id', $chapterId)
            ->where('id', $id)
            ->firstOrFail();

        if (! in_array($salesOrder->status, ['RETURNED', 'DRAFT'], true)) {
            return response()->json([
                'message' => "Only RETURNED or DRAFT sales orders can be revised. Current status: {$salesOrder->status}.",
            ], 422);
        }

        $revisedOrder = DB::transaction(function () use ($salesOrder, $validated) {
            // 1. Create immutable revision snapshot of current version
            SalesOrderRevision::create([
                'so_id' => $salesOrder->id,
                'version' => $salesOrder->version,
                'snapshot' => $salesOrder->toArray(),
                'reason' => $validated['reason'] ?? null,
                'created_by' => $validated['created_by'] ?? $salesOrder->created_by,
            ]);

            // 2. Increment version
            $newVersion = $salesOrder->version + 1;

            // 3. Update lines if provided
            if (! empty($validated['lines'])) {
                $salesOrder->lines()->delete();

                foreach ($validated['lines'] as $lineData) {
                    $orderedQty = (float) $lineData['ordered_quantity'];
                    $unitPrice = (float) $lineData['unit_price'];
                    $lineTotal = round($orderedQty * $unitPrice, 2);

                    SalesOrderLine::create([
                        'so_id' => $salesOrder->id,
                        'variant_id' => $lineData['variant_id'],
                        'unit_id' => $lineData['unit_id'],
                        'ordered_quantity' => $orderedQty,
                        'unit_price' => $unitPrice,
                        'line_total' => $lineTotal,
                        'reserved_quantity' => 0,
                        'backordered_quantity' => 0,
                        'delivered_quantity' => 0,
                        'line_status' => 'ACTIVE',
                        'material_version' => $lineData['material_version'] ?? 1,
                    ]);
                }
            }

            // 4. Update sales order attributes and reset status to SUBMITTED or DRAFT
            $newStatus = $validated['status'] ?? 'SUBMITTED';

            $updateData = [
                'version' => $newVersion,
                'status' => $newStatus,
                'rejection_reason' => null,
                'approved_by' => null,
            ];

            if (isset($validated['target_delivery_date'])) {
                $updateData['target_delivery_date'] = $validated['target_delivery_date'];
            }
            if (isset($validated['terms_conditions'])) {
                $updateData['terms_conditions'] = $validated['terms_conditions'];
            }

            $salesOrder->update($updateData);

            return $salesOrder;
        });

        return response()->json([
            'data' => $revisedOrder->fresh(['buyer', 'lines', 'revisions']),
            'message' => 'Sales order revised successfully.',
        ]);
    }

    public function cancel(Request $request, string $chapterId, string $id): JsonResponse
    {
        $salesOrder = SalesOrder::where('chapter_id', $chapterId)
            ->where('id', $id)
            ->firstOrFail();

        if (in_array($salesOrder->status, ['CANCELLED', 'COMPLETED'], true)) {
            return response()->json([
                'message' => "Sales order is already {$salesOrder->status} and cannot be cancelled again.",
            ], 422);
        }

        DB::transaction(function () use ($salesOrder, $request) {
            $salesOrder->loadMissing('lines');
            $actorId = $request->header('X-User-Id') ?? session('user_id') ?? $salesOrder->created_by;

            SalesOrderRevision::create([
                'so_id' => $salesOrder->id,
                'version' => $salesOrder->version,
                'snapshot' => $salesOrder->toArray(),
                'reason' => $request->input('reason'),
                'created_by' => $actorId,
            ]);

            $activeReservations = StockReservation::where('chapter_id', $salesOrder->chapter_id)
                ->where('source_type', 'SO')
                ->where('source_id', $salesOrder->id)
                ->where('status', 'ACTIVE')
                ->lockForUpdate()
                ->get();

            foreach ($activeReservations as $res) {
                $activeAmt = BcMath::str($res->active_quantity ?? $res->quantity);
                $res->status = 'RELEASED';
                $res->state = 'released';
                $res->released_quantity = BcMath::add($res->released_quantity ?? '0', $activeAmt);
                $res->active_quantity = BcMath::str('0');
                $res->quantity = BcMath::str('0');
                $res->save();
            }

            $salesOrder->update([
                'status' => 'CANCELLED',
                'rejection_reason' => $request->input('reason', $salesOrder->rejection_reason),
            ]);
            $salesOrder->lines()->update([
                'line_status' => 'CANCELLED',
                'reserved_quantity' => 0,
            ]);
        });

        return response()->json([
            'data' => $salesOrder->fresh(['buyer', 'lines']),
            'message' => 'Sales order cancelled successfully.',
        ]);
    }

    public function print(string $chapterId, string $id): JsonResponse
    {
        $salesOrder = SalesOrder::with(['buyer', 'lines'])
            ->where('chapter_id', $chapterId)
            ->where('id', $id)
            ->firstOrFail();

        $escapedNumber = e($salesOrder->so_number);
        $escapedStatus = e($salesOrder->status);
        $escapedBuyer = e($salesOrder->buyer?->name ?? 'N/A');

        $rowsHtml = '';
        foreach ($salesOrder->lines as $line) {
            $rowsHtml .= '<tr><td>'.e($line->variant_id).'</td><td>'.e($line->unit_id).'</td><td>'.e((string) $line->ordered_quantity).'</td></tr>';
        }

        $html = "<div class='so-print-view' data-status='{$escapedStatus}'>"
            .'<h3>Sales Order</h3>'
            ."<p>SO: {$escapedNumber}</p>"
            ."<p>Status: {$escapedStatus}</p>"
            ."<p>Buyer: {$escapedBuyer}</p>"
            ."<table><tbody>{$rowsHtml}</tbody></table>"
            .'</div>';

        return response()->json([
            'data' => [
                'sales_order' => $salesOrder,
                'printable_html' => $html,
                'printed_at' => now()->toIso8601ZuluString(),
            ],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    private function generateSoNumber(string $chapterId): string
    {
        $prefix = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $chapterId));
        $date = date('Ymd');
        $random = strtoupper(Str::random(4));

        return "SO-{$prefix}-{$date}-{$random}";
    }
}
