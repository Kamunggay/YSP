<?php

namespace App\Services\Sales;

use App\Models\CustomerContactLog;
use App\Models\SalesOrder;
use App\Models\SalesOrderRevision;
use App\Models\StockReservation;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class SalesOrderAcceptanceService
{
    public const ALLOWED_STATUSES = [
        'FULL_ACCEPTED',
        'PARTIAL_ACCEPTED',
        'BACKORDER_ACCEPTED',
        'DECLINED',
    ];

    /**
     * Record a customer contact log for a sales order.
     *
     * @param  array<string, mixed>  $data
     */
    public function recordCustomerContact(SalesOrder $so, array $data): CustomerContactLog
    {
        return CustomerContactLog::create([
            'so_id' => $so->id,
            'contact_timestamp' => $data['contact_timestamp'] ?? now(),
            'contact_method' => $data['contact_method'],
            'officer_id' => $data['officer_id'],
            'buyer_response' => $data['buyer_response'],
            'notes' => $data['notes'] ?? null,
        ]);
    }

    /**
     * Record buyer acceptance decision and trigger cancellation workflow if declined.
     *
     * @throws InvalidArgumentException
     */
    public function recordBuyerAcceptance(
        SalesOrder $so,
        string $acceptanceStatus,
        ?string $reason = null,
        ?string $officerId = null
    ): SalesOrder {
        if (! in_array($acceptanceStatus, self::ALLOWED_STATUSES, true)) {
            throw new InvalidArgumentException(
                "Invalid buyer acceptance status: {$acceptanceStatus}. Allowed values: ".implode(', ', self::ALLOWED_STATUSES)
            );
        }

        return DB::transaction(function () use ($so, $acceptanceStatus, $reason, $officerId) {
            $so->buyer_acceptance_status = $acceptanceStatus;

            // Invariant T-04: If acceptanceStatus === 'DECLINED'
            if ($acceptanceStatus === 'DECLINED') {
                $declinedReason = $reason ?: 'BUYER_DECLINED_TERMS';

                // 1. Create a SalesOrderRevision audit entry with reason = 'BUYER_DECLINED_TERMS' and current snapshot
                SalesOrderRevision::create([
                    'so_id' => $so->id,
                    'version' => $so->version,
                    'snapshot' => $so->load(['buyer', 'lines', 'reservations'])->toArray(),
                    'reason' => 'BUYER_DECLINED_TERMS',
                    'created_by' => $officerId ?? $so->created_by,
                ]);

                // 2. Transition status = 'CANCELLED'
                $so->status = 'CANCELLED';
                $so->rejection_reason = $declinedReason;

                // 3. Release all active StockReservation records for $so->id
                StockReservation::where('chapter_id', $so->chapter_id)
                    ->where('source_type', 'SO')
                    ->where('source_id', $so->id)
                    ->where('status', 'ACTIVE')
                    ->update(['status' => 'RELEASED']);

                // 4. Reset reserved_quantity = 0 on active lines
                $so->lines()
                    ->where('line_status', 'ACTIVE')
                    ->update([
                        'reserved_quantity' => 0,
                    ]);
            }

            $so->save();

            return $so->fresh(['buyer', 'lines', 'revisions', 'reservations', 'contactLogs']);
        });
    }
}
