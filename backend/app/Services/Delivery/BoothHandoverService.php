<?php

namespace App\Services\Delivery;

use App\Models\Handover;
use App\Models\HandoverLine;
use App\Models\HandoverReceipt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class BoothHandoverService
{
    /**
     * Post a booth custody handover (booth_checkout or booth_return).
     * Owns the outer database transaction.
     */
    public function postBoothCustodyHandover(array $data, ?string $chapterId = null, ?string $userId = null): array
    {
        return DB::transaction(function () use ($data, $chapterId, $userId) {
            $sourceId = $data['source']['id'];
            $sourceKind = strtoupper($data['source']['kind']);
            $chapter = $chapterId ?? $data['chapter_id'] ?? 'default-chapter';
            $officerId = $userId ?? $data['handover_officer_id'] ?? 'system-officer';

            $handover = Handover::create([
                'chapter_id' => $chapter,
                'handover_reference' => 'HO-BOOTH-' . strtoupper(Str::random(8)),
                'source_type' => $sourceKind, // BOOTH_CHECKOUT or BOOTH_RETURN
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
                    'variant_id' => $line['variant_id'] ?? 'VAR-BOOTH',
                    'unit_id' => $line['unit_id'] ?? 'UNIT-BOOTH',
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

            HandoverReceipt::create([
                'handover_id' => $handover->id,
                'receipt_type' => 'BOOTH_CHECKOUT_RECEIPT',
                'receipt_number' => 'BCR-' . strtoupper(Str::random(8)),
                'printed_at' => now(),
                'printed_by' => $officerId,
            ]);

            return [
                'operation_id' => (string) Str::uuid(),
                'outcome' => 'committed',
                'handover_id' => $handover->id,
                'source' => [
                    'kind' => $data['source']['kind'],
                    'id' => $sourceId,
                    'version' => 1,
                ],
                'lines' => $responseLines,
                'acknowledgment_binding_id' => $data['acknowledgment_binding_id'] ?? null,
            ];
        });
    }
}
