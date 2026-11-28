<?php

declare(strict_types=1);

namespace App\Services\Inventory\Participants;

/**
 * Internal seam reading open procurement supply (RepFs and Purchase Orders)
 * for Stage 2 net-shortage snapshots and Stage 1 inbound_open_po projections.
 *
 * Implementations return normalized inbound source entries keyed for aggregation.
 */
interface OpenProcurementSupplyProvider
{
    /**
     * Use lock: false when the caller already has a consistent inventory snapshot.
     *
     * @param  list<string>  $variantIds
     * @return array<int, array{
     *   variant_id: string,
     *   unit_id: string,
     *   source_kind: 'repf'|'po',
     *   source_id: string,
     *   source_reference: string|null,
     *   status: string,
     *   open_quantity: string,
     *   coverage_state: 'counted'|'late'|'disputed'|'ineligible',
     *   exclusion_reason: string|null
     * }>
     */
    public function getInboundSourcesForVariants(
        string $chapterId,
        array $variantIds,
        ?string $excludeRepfId = null,
        ?string $observedAt = null,
        bool $lock = true,
    ): array;
}
