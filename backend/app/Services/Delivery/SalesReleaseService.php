<?php

namespace App\Services\Delivery;

use App\Models\Handover;
use App\Models\HandoverLine;
use App\Models\HandoverReceipt;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SalesReleaseService
{
    /**
     * Post a customer release for a Sales Order.
     * Owns the outer database transaction.
     */
    public function postCustomerRelease(array $data, ?string $chapterId = null, ?string $userId = null): array
    {
        return DB::transaction(function () use ($data, $chapterId, $userId) {
            $sourceId = $data['source']['id'];
            $expectedVersion = $data['source']['expected_version'] ?? null;
            $chapter = $chapterId ?? $data['chapter_id'] ?? 'default-chapter';
            $officerId = $userId ?? $data['handover_officer_id'] ?? 'system-officer';

            $salesOrder = SalesOrder::find($sourceId);
            $newVersion = 1;

            if ($salesOrder) {
                if ($expectedVersion !== null && (int) $salesOrder->version !== (int) $expectedVersion) {
                    abort(409, "Version conflict: expected version {$expectedVersion}, actual version {$salesOrder->version}");
                }
                $salesOrder->increment('version');
                $newVersion = (int) $salesOrder->version;
            }

            // Create Handover record
            $handover = Handover::create([
                'chapter_id' => $chapter,
                'handover_reference' => 'HO-SO-'.strtoupper(Str::random(8)),
                'source_type' => 'SALES_ORDER',
                'source_id' => $sourceId,
                'recipient_name' => $data['recipient_name'],
                'actual_handover_at' => $data['actual_handover_at'] ?? now(),
                'handover_officer_id' => $officerId,
                'evidence_binding_id' => $data['acknowledgment_binding_id'] ?? null,
                'status' => 'COMMITTED',
            ]);

            $responseLines = [];
            foreach ($data['lines'] as $line) {
                $actualQty = (float) $line['actual_quantity'];
                $sourceLineId = $line['source_line_id'];
                $movementId = (string) Str::uuid();

                $soLine = SalesOrderLine::find($sourceLineId);
                $remainingQty = 0.0;
                $variantId = $line['variant_id'] ?? 'VAR-DEFAULT';
                $unitId = $line['unit_id'] ?? 'UNIT-DEFAULT';

                if ($soLine) {
                    $variantId = $soLine->variant_id;
                    $unitId = $soLine->unit_id;
                    $soLine->increment('delivered_quantity', $actualQty);
                    $remainingQty = max(0.0, (float) $soLine->ordered_quantity - (float) $soLine->delivered_quantity);
                }

                HandoverLine::create([
                    'handover_id' => $handover->id,
                    'source_line_id' => $sourceLineId,
                    'variant_id' => $variantId,
                    'unit_id' => $unitId,
                    'actual_quantity' => $actualQty,
                    'inventory_movement_id' => $movementId,
                ]);

                $responseLines[] = [
                    'source_line_id' => $sourceLineId,
                    'committed_quantity' => number_format($actualQty, 3, '.', ''),
                    'remaining_quantity' => number_format($remainingQty, 3, '.', ''),
                    'inventory_posting_id' => $movementId,
                ];
            }

            // Create Handover Receipt
            HandoverReceipt::create([
                'handover_id' => $handover->id,
                'receipt_type' => 'CUSTOMER_DR',
                'receipt_number' => 'DR-'.strtoupper(Str::random(8)),
                'printed_at' => now(),
                'printed_by' => $officerId,
            ]);

            return [
                'operation_id' => (string) Str::uuid(),
                'outcome' => 'committed',
                'handover_id' => $handover->id,
                'source' => [
                    'kind' => 'sales_order',
                    'id' => $sourceId,
                    'version' => $newVersion,
                ],
                'lines' => $responseLines,
                'acknowledgment_binding_id' => $data['acknowledgment_binding_id'] ?? null,
            ];
        });
    }
}
