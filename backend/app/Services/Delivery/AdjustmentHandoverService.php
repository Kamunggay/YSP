<?php

namespace App\Services\Delivery;

use App\Models\Handover;
use App\Models\HandoverLine;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AdjustmentHandoverService
{
    /**
     * Post a replacement handover for an inventory adjustment.
     * Owns the outer database transaction.
     */
    public function postReplacementHandover(array $data, ?string $chapterId = null, ?string $userId = null): array
    {
        return DB::transaction(function () use ($data, $chapterId, $userId) {
            $sourceId = $data['source']['id'];
            $chapter = $chapterId ?? $data['chapter_id'] ?? 'default-chapter';
            $officerId = $userId ?? $data['handover_officer_id'] ?? 'system-officer';

            $handover = Handover::create([
                'chapter_id' => $chapter,
                'handover_reference' => 'HO-ADJ-' . strtoupper(Str::random(8)),
                'source_type' => 'ADJUSTMENT',
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

                HandoverLine::create([
                    'handover_id' => $handover->id,
                    'source_line_id' => $sourceLineId,
                    'variant_id' => $line['variant_id'] ?? 'VAR-ADJ',
                    'unit_id' => $line['unit_id'] ?? 'UNIT-ADJ',
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

            return [
                'operation_id' => (string) Str::uuid(),
                'outcome' => 'committed',
                'handover_id' => $handover->id,
                'source' => [
                    'kind' => 'adjustment',
                    'id' => $sourceId,
                    'version' => 1,
                ],
                'lines' => $responseLines,
                'acknowledgment_binding_id' => $data['acknowledgment_binding_id'] ?? null,
            ];
        });
    }
}
