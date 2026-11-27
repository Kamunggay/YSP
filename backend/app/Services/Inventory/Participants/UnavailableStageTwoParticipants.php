<?php

declare(strict_types=1);

namespace App\Services\Inventory\Participants;

use App\Exceptions\ContractException;

final class UnavailableStageTwoParticipants implements LotRestrictionResolutionParticipant, NetShortageSnapshotParticipant, ReceivingInventoryParticipant
{
    public function computeNetShortageSnapshot(array $input): never
    {
        $this->unavailable();
    }

    public function prepareReceivingInventory(array $input): never
    {
        $this->unavailable();
    }

    public function applyLotRestrictionResolution(array $input): never
    {
        $this->unavailable();
    }

    private function unavailable(): never
    {
        throw new ContractException(503, 'unavailable', 'The required Stage 2 participant is temporarily unavailable.');
    }
}
