<?php

declare(strict_types=1);

namespace App\Services\Inventory\Participants;

/**
 * Contract interface implemented by Glenn (Stage 2A) and consumed synchronously
 * by Procurement/RepF workflows to evaluate net shortage and replenishment need.
 */
interface NetShortageSnapshotParticipant
{
    /**
     * @param  array{
     *   chapter_id: string,
     *   actor_id: string,
     *   observed_at: string,
     *   variant_ids: non-empty-list<string>,
     *   include_rf_line_breakdown: bool,
     *   require_rop_and_target_policies: bool,
     *   exclude_repf_id: string|null
     * }  $input
     * @return array{
     *   outcome: 'ready',
     *   snapshot_version: positive-int,
     *   observed_at: string,
     *   items: list<array<string, mixed>>
     * }|array{
     *   outcome: 'setup_blocked',
     *   blockers: non-empty-list<array<string, mixed>>
     * }|array{
     *   outcome: 'rejected',
     *   code: 'chapter_not_found'|'resource_not_found'|'unit_mismatch'|'unavailable',
     *   message: string
     * }
     */
    public function computeNetShortageSnapshot(array $input): array;
}
