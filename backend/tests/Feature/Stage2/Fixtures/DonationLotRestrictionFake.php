<?php

namespace Tests\Feature\Stage2\Fixtures;

use App\Models\InventoryLot;
use App\Services\Inventory\Participants\LotRestrictionResolutionParticipant;

final class DonationLotRestrictionFake implements LotRestrictionResolutionParticipant
{
    /** @var list<array<string, mixed>> */
    public array $calls = [];

    /** @var array<string, mixed>|null */
    public ?array $failure = null;

    public function applyLotRestrictionResolution(array $input): array
    {
        $this->calls[] = $input;
        if ($this->failure !== null) {
            return $this->failure;
        }

        $lots = InventoryLot::where('chapter_id', $input['chapter_id'])
            ->where('source_kind', 'da_rm')
            ->where('origin_source_id', $input['da_id'])
            ->where('origin_source_line_id', $input['da_line_id'])
            ->where('quantity_on_hand', '>', 0)
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        $updatedIds = [];
        foreach ($lots as $lot) {
            $lot->restriction_state = $input['restrictions']['state'];
            $lot->restrictions_json = $input['restrictions'];
            $lot->immediately_allocatable = true;
            $lot->material_version = (int) $lot->material_version + 1;
            $lot->stock_version = (int) $lot->stock_version + 1;
            $lot->save();
            $updatedIds[] = $lot->id;
        }

        return [
            'outcome' => 'ready',
            'updated_lot_ids' => $updatedIds,
        ];
    }
}
