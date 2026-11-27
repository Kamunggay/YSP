<?php

declare(strict_types=1);

namespace App\Services\Inventory\Participants;

/**
 * ApplyLotRestrictionResolutionInput and ApplyLotRestrictionResolutionResult in contracts/stage2/openapi.yaml.
 *
 * @phpstan-type DonationRestriction array{
 *     state: 'bounded'|'uninterpreted',
 *     allowed_uses: list<'internal_use'|'sale'|'booth_custody'>,
 *     event_ids: list<string>,
 *     requesting_unit_ids: list<string>,
 *     effective_from: string|null,
 *     effective_until: string|null,
 *     interpretation_id: string|null,
 *     source_condition_reference: string|null,
 * }
 * @phpstan-type DonationAppliedRestriction array{
 *     state: 'bounded'|'unrestricted',
 *     allowed_uses: list<'internal_use'|'sale'|'booth_custody'>,
 *     event_ids: list<string>,
 *     requesting_unit_ids: list<string>,
 *     effective_from: string|null,
 *     effective_until: string|null,
 *     interpretation_id: string|null,
 *     source_condition_reference: string|null,
 * }
 * @phpstan-type ParticipantInput array{
 *     chapter_id: string,
 *     da_id: string,
 *     da_line_id: string,
 *     resolution_id: string,
 *     previous_restrictions: DonationRestriction,
 *     restrictions: DonationAppliedRestriction,
 * }
 * @phpstan-type ReadyResult array{outcome: 'ready', updated_lot_ids: list<string>}
 * @phpstan-type RejectedResult array{outcome: 'rejected', reason: 'target_locked'}
 */
interface LotRestrictionResolutionParticipant
{
    /**
     * @param  ParticipantInput  $input
     * @return ReadyResult|RejectedResult
     */
    public function applyLotRestrictionResolution(array $input): array;
}
