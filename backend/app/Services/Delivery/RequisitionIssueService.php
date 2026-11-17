<?php

namespace App\Services\Delivery;

use App\Models\ActualIssue;
use App\Models\ActualIssueLine;
use App\Models\Handover;
use App\Models\HandoverLine;
use App\Models\HandoverReceipt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RequisitionIssueService
{
    /**
     * Post an actual issue for an internal Requisition.
     * Owns the outer database transaction.
     */
    public function postActualIssue(array $data, ?string $chapterId = null, ?string $userId = null): array
    {
        return DB::transaction(function () use ($data, $chapterId, $userId) {
            $sourceId = $data['source']['id'];
            $chapter = $chapterId ?? $data['chapter_id'] ?? 'default-chapter';
            $officerId = $userId ?? $data['handover_officer_id'] ?? 'system-officer';

            // Create ActualIssue record
            $actualIssue = ActualIssue::create([
                'chapter_id' => $chapter,
                'requisition_id' => $sourceId,
                'issue_number' => 'IS-'.strtoupper(Str::random(8)),
                'status' => 'posted',
                'recipient_name' => $data['recipient_name'],
                'prepared_by_user_id' => $officerId,
                'actual_handover_at' => $data['actual_handover_at'] ?? now(),
                'evidence_binding_id' => $data['acknowledgment_binding_id'] ?? null,
                'material_version' => 1,
            ]);

            // Create Handover record
            $handover = Handover::create([
                'chapter_id' => $chapter,
                'handover_reference' => 'HO-REQ-'.strtoupper(Str::random(8)),
                'source_type' => 'REQUISITION',
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
                $variantId = $line['variant_id'] ?? 'VAR-DEFAULT';
                $unitId = $line['unit_id'] ?? 'UNIT-DEFAULT';
                $lotId = $line['lot_id'] ?? null;

                ActualIssueLine::create([
                    'actual_issue_id' => $actualIssue->id,
                    'requisition_line_id' => $sourceLineId,
                    'variant_id' => $variantId,
                    'unit_id' => $unitId,
                    'lot_id' => $lotId,
                    'allocated_quantity' => $actualQty,
                    'issued_quantity' => $actualQty,
                ]);

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
                    'remaining_quantity' => '0.000',
                    'inventory_posting_id' => $movementId,
                ];
            }

            // Create Handover Receipt
            HandoverReceipt::create([
                'handover_id' => $handover->id,
                'receipt_type' => 'IS_AR',
                'receipt_number' => 'AR-'.strtoupper(Str::random(8)),
                'printed_at' => now(),
                'printed_by' => $officerId,
            ]);

            return [
                'operation_id' => (string) Str::uuid(),
                'outcome' => 'committed',
                'handover_id' => $handover->id,
                'actual_issue_id' => $actualIssue->id,
                'source' => [
                    'kind' => 'requisition',
                    'id' => $sourceId,
                    'version' => 1,
                ],
                'lines' => $responseLines,
                'acknowledgment_binding_id' => $data['acknowledgment_binding_id'] ?? null,
            ];
        });
    }
}
