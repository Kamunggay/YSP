<?php

namespace App\Services\Inventory\Participants;

use App\Exceptions\ContractException;
use App\Models\InternalRf;
use App\Models\InternalRfLine;
use App\Models\RfReservationAllocation;
use App\Models\StockHold;
use App\Models\StockReservation;
use App\Services\Shared\BcMath;

class PrepareRfDemandChangeParticipant
{
    /**
     * Synchronous transaction-local RF/demand/reservation participant.
     * MUST be called inside the caller's active database transaction.
     * Never opens or commits its own transaction.
     *
     * @param  array{
     *   actor_id: string,
     *   chapter_id: string,
     *   operation_id: string,
     *   change: string,
     *   rf_id: string,
     *   rf_line_id: string,
     *   expected_rf_version?: ?int,
     *   expected_rf_material_version?: ?int,
     *   expected_rf_progress_version?: ?int,
     *   quantity: string|int|float,
     *   override_policy_id?: ?string
     * }  $input
     * @return array<string, mixed>
     *
     * @throws ContractException
     */
    public function execute(array $input): array
    {
        $chapterId = (string) $input['chapter_id'];
        $rfId = (string) $input['rf_id'];
        $rfLineId = (string) $input['rf_line_id'];
        $change = (string) $input['change'];
        $quantity = BcMath::str($input['quantity'] ?? '0');

        if (! in_array($change, ['reserve', 'release', 'reallocate', 'consume'], true)) {
            throw new ContractException(422, 'invalid_input', "Unsupported RF demand change '{$change}'.");
        }

        $rf = InternalRf::where('chapter_id', $chapterId)
            ->where('id', $rfId)
            ->lockForUpdate()
            ->first();

        if (! $rf) {
            throw new ContractException(404, 'resource_not_found', "Internal RF {$rfId} not found in chapter {$chapterId}.");
        }

        if ($rf->status !== 'approved') {
            throw new ContractException(409, 'approval_invalid', "RF {$rfId} is in status '{$rf->status}' and cannot undergo demand change '{$change}'.");
        }

        if (isset($input['expected_rf_version']) && (int) $input['expected_rf_version'] !== (int) $rf->version) {
            throw new ContractException(409, 'version_conflict', 'expected_rf_version does not match current RF version.');
        }
        if (isset($input['expected_rf_material_version']) && (int) $input['expected_rf_material_version'] !== (int) $rf->material_version) {
            throw new ContractException(409, 'material_version_conflict', 'expected_rf_material_version does not match current RF material_version.');
        }
        if (isset($input['expected_rf_progress_version']) && (int) $input['expected_rf_progress_version'] !== (int) $rf->progress_version) {
            throw new ContractException(409, 'progress_version_conflict', 'expected_rf_progress_version does not match current RF progress_version.');
        }

        $line = InternalRfLine::where('rf_id', $rf->id)
            ->where('id', $rfLineId)
            ->lockForUpdate()
            ->first();

        if (! $line) {
            throw new ContractException(404, 'resource_not_found', "RF line {$rfLineId} not found on RF {$rfId}.");
        }

        $approved = BcMath::str($line->approved_quantity);
        $issued = BcMath::str($line->issued_quantity);
        $reserved = BcMath::str($line->reserved_quantity);
        $canceled = BcMath::str($line->canceled_quantity);
        $remaining = BcMath::sub(BcMath::sub($approved, $issued), $canceled);

        $reservedDelta = BcMath::str('0');
        $releasedDelta = BcMath::str('0');
        $transferredDelta = BcMath::str('0');
        $consumedDelta = BcMath::str('0');

        if ($change === 'reserve') {
            if (BcMath::comp($quantity, '0') <= 0) {
                throw new ContractException(422, 'invalid_input', 'Reserve quantity must be positive.');
            }
            $newReserved = BcMath::add($reserved, $quantity);
            if (BcMath::comp($newReserved, $remaining) > 0) {
                throw new ContractException(409, 'demand_exceeded', "Requested reserve {$quantity} exceeds unreserved remaining RF demand.", [
                    'failed_intent_committed' => false,
                ]);
            }
            $reserved = $newReserved;
            $reservedDelta = $quantity;
        } elseif ($change === 'release') {
            if (BcMath::comp($quantity, '0') <= 0) {
                throw new ContractException(422, 'invalid_input', 'Release quantity must be positive.');
            }
            if (BcMath::comp($quantity, $reserved) > 0) {
                throw new ContractException(409, 'reservation_conflict', "Release quantity {$quantity} exceeds line reserved quantity {$reserved}.", [
                    'failed_intent_committed' => false,
                ]);
            }
            $reserved = BcMath::sub($reserved, $quantity);
            $releasedDelta = $quantity;
        } elseif ($change === 'reallocate') {
            if (BcMath::comp($quantity, '0') <= 0) {
                throw new ContractException(422, 'invalid_input', 'Reallocate quantity must be positive.');
            }
            if (BcMath::comp($quantity, $reserved) > 0) {
                throw new ContractException(409, 'reservation_conflict', "Reallocate quantity {$quantity} exceeds line reserved quantity {$reserved}.", [
                    'failed_intent_committed' => false,
                ]);
            }
            $transferredDelta = $quantity;
        } elseif ($change === 'consume') {
            if (BcMath::comp($quantity, '0') <= 0) {
                throw new ContractException(422, 'invalid_input', 'Consume quantity must be positive.');
            }
            if (BcMath::comp($quantity, $reserved) > 0 || BcMath::comp($quantity, $remaining) > 0) {
                throw new ContractException(409, 'demand_exceeded', "Consume quantity {$quantity} exceeds reserved/remaining RF demand.", [
                    'failed_intent_committed' => false,
                ]);
            }
            $reserved = BcMath::sub($reserved, $quantity);
            $issued = BcMath::add($issued, $quantity);
            $consumedDelta = $quantity;
        }

        // Recompute blocked_reserved_quantity for this line from active allocations & active holds
        $blockedReserved = $this->computeBlockedForLine($chapterId, $line->id);
        if (BcMath::comp($blockedReserved, $reserved) > 0) {
            $blockedReserved = $reserved;
        }

        $line->reserved_quantity = $reserved;
        $line->issued_quantity = $issued;
        $line->blocked_reserved_quantity = $blockedReserved;
        $line->save();

        // Update RF aggregate fulfillment & versions
        $allLines = InternalRfLine::where('rf_id', $rf->id)->get();
        $totalRemaining = BcMath::str('0');
        $totalIssued = BcMath::str('0');
        $totalCanceled = BcMath::str('0');

        foreach ($allLines as $l) {
            $lRem = BcMath::sub(BcMath::sub($l->approved_quantity, $l->issued_quantity), $l->canceled_quantity);
            if (BcMath::comp($lRem, '0') > 0) {
                $totalRemaining = BcMath::add($totalRemaining, $lRem);
            }
            $totalIssued = BcMath::add($totalIssued, $l->issued_quantity);
            $totalCanceled = BcMath::add($totalCanceled, $l->canceled_quantity);
        }

        if (BcMath::isZero($totalRemaining)) {
            $rf->fulfillment_status = BcMath::isPositive($totalCanceled) ? 'closed_canceled' : 'fulfilled';
        } elseif (BcMath::isPositive($totalIssued)) {
            $rf->fulfillment_status = 'partially_issued';
        } else {
            $rf->fulfillment_status = 'outstanding';
        }

        $rf->version += 1;
        $rf->progress_version += 1;
        $rf->save();

        $newRemaining = BcMath::sub(BcMath::sub($approved, $issued), $canceled);
        $newUnreserved = BcMath::sub($newRemaining, $reserved);
        $scale = (int) ($line->identity_at_approval['quantity_scale'] ?? 0);

        return [
            'outcome' => 'ready',
            'rf_id' => $rf->id,
            'rf_line_id' => $line->id,
            'next_rf_version' => (int) $rf->version,
            'next_progress_version' => (int) $rf->progress_version,
            'progress' => [
                'approved_quantity' => BcMath::format($approved, $scale),
                'issued_quantity' => BcMath::format($issued, $scale),
                'reserved_quantity' => BcMath::format($reserved, $scale),
                'blocked_reserved_quantity' => BcMath::format($blockedReserved, $scale),
                'canceled_quantity' => BcMath::format($canceled, $scale),
                'remaining_quantity' => BcMath::format($newRemaining, $scale),
                'unreserved_quantity' => BcMath::format($newUnreserved, $scale),
            ],
            'reserved_quantity' => BcMath::format($reservedDelta, $scale),
            'released_quantity' => BcMath::format($releasedDelta, $scale),
            'transferred_quantity' => BcMath::format($transferredDelta, $scale),
            'consumed_quantity' => BcMath::format($consumedDelta, $scale),
        ];
    }

    public function computeBlockedForLine(string $chapterId, string $rfLineId): string
    {
        $reservations = StockReservation::where('chapter_id', $chapterId)
            ->where('source_type', 'RF')
            ->where('rf_line_id', $rfLineId)
            ->where('status', 'ACTIVE')
            ->get();

        if ($reservations->isEmpty()) {
            return BcMath::str('0');
        }

        $resIds = $reservations->pluck('id')->all();
        $allocs = RfReservationAllocation::whereIn('reservation_id', $resIds)
            ->where('status', 'active')
            ->get();

        if ($allocs->isEmpty()) {
            return BcMath::str('0');
        }

        $lotIds = $allocs->pluck('lot_id')->unique()->values()->all();
        $holds = StockHold::where('chapter_id', $chapterId)
            ->where('status', 'active')
            ->whereHas('ranges', fn ($q) => $q->whereIn('lot_id', $lotIds))
            ->with(['ranges' => fn ($q) => $q->whereIn('lot_id', $lotIds)])
            ->get();

        if ($holds->isEmpty()) {
            return BcMath::str('0');
        }

        $holdByLot = [];
        foreach ($holds as $hold) {
            foreach ($hold->ranges as $r) {
                $holdByLot[$r->lot_id][] = [
                    'offset' => BcMath::str($r->offset_quantity),
                    'quantity' => BcMath::str($r->quantity),
                ];
            }
        }

        $allocByLot = [];
        foreach ($allocs as $a) {
            $rem = BcMath::sub($a->quantity, BcMath::add($a->consumed_quantity, $a->released_quantity));
            if (BcMath::comp($rem, '0') > 0) {
                $allocByLot[$a->lot_id][] = [
                    'offset' => BcMath::str($a->offset_quantity),
                    'quantity' => $rem,
                ];
            }
        }

        $blocked = BcMath::str('0');
        foreach ($allocByLot as $lotId => $aIntervals) {
            $hIntervals = $holdByLot[$lotId] ?? [];
            if (! empty($hIntervals)) {
                $intersections = BcMath::intersectIntervalLists($aIntervals, $hIntervals);
                $blocked = BcMath::add($blocked, BcMath::intervalUnionLength($intersections));
            }
        }

        return $blocked;
    }
}
