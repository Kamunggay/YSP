<?php

namespace App\Services\Procurement;

use App\Exceptions\ContractException;
use App\Services\Inventory\Participants\NetShortageSnapshotParticipant;
use Brick\Math\BigDecimal;
use Illuminate\Support\Arr;

final class RepfNetNeed
{
    private const BREAKDOWN_FIELDS = [
        'approved_rop', 'approved_target_level', 'usable_stockroom_on_hand', 'eligible_usable_stockroom_on_hand',
        'active_rf_reservations', 'eligible_available_to_allocate', 'unreserved_approved_rf_shortage',
        'open_repf_quantity', 'open_po_inbound_quantity', 'total_open_inbound_coverage', 'excluded_inbound_quantity',
        'gross_rf_shortage_need', 'gross_rop_replenishment_need', 'gross_combined_need',
        'uncovered_rf_shortage_quantity', 'uncovered_rop_replenishment_quantity',
    ];

    public function __construct(private readonly NetShortageSnapshotParticipant $participant) {}

    public function snapshot(string $chapterId, string $actorId, ?string $repfId, array $lines, bool $enforce): array
    {
        $result = $this->participant->computeNetShortageSnapshot([
            'chapter_id' => $chapterId,
            'actor_id' => $actorId,
            'observed_at' => now('UTC')->format('Y-m-d\TH:i:s.u\Z'),
            'variant_ids' => array_values(array_unique(array_column($lines, 'variant_id'))),
            'include_rf_line_breakdown' => in_array('rf_shortage', array_column($lines, 'trigger_kind'), true),
            'require_rop_and_target_policies' => $enforce && in_array('rop_replenishment', array_column($lines, 'trigger_kind'), true),
            'exclude_repf_id' => $repfId,
        ]);

        if ($result['outcome'] === 'setup_blocked') {
            throw RepfWorkflow::conflict('setup_blocked', 'Current approved setup is required for this action.', blockers: $result['blockers']);
        }
        if ($result['outcome'] === 'rejected') {
            throw match ($result['code']) {
                'unit_mismatch' => RepfWorkflow::conflict('source_not_eligible', 'The selected unit does not match the variant.'),
                'chapter_not_found', 'resource_not_found' => RepfWorkflow::notFound(),
                default => new ContractException(503, 'unavailable', 'The net shortage snapshot is unavailable.'),
            };
        }

        if (! $enforce) {
            return [];
        }

        $items = array_column($result['items'], null, 'variant_id');
        $byTrigger = [];
        $byVariant = [];
        foreach ($lines as $line) {
            $variant = $line['variant_id'];
            $trigger = $line['trigger_kind'];
            $quantity = $line['requested_quantity'];
            $byTrigger[$variant][$trigger] = ($byTrigger[$variant][$trigger] ?? BigDecimal::zero())->plus($quantity);
            $byVariant[$variant] = ($byVariant[$variant] ?? BigDecimal::zero())->plus($quantity);
        }

        $breakdowns = [];
        $conflicts = [];
        foreach ($lines as $index => $line) {
            $variant = $line['variant_id'];
            $trigger = $line['trigger_kind'];
            $item = $items[$variant] ?? throw new ContractException(503, 'unavailable', 'The net shortage snapshot is incomplete.');
            $triggerNeed = $item["uncovered_{$trigger}_quantity"];
            $lineNeed = BigDecimal::of($triggerNeed);
            if ($trigger === 'rf_shortage') {
                $rfLines = array_column($item['contributing_rf_lines'], null, 'rf_line_id');
                $lineNeed = BigDecimal::min($lineNeed, $rfLines[$line['rf_line_id']]['unreserved_outstanding_quantity'] ?? '0')
                    ->toScale($item['quantity_scale']);
            }
            $proposed = $item['proposed_uncovered_quantity'];
            $exceeds = $lineNeed->isLessThan($line['requested_quantity'])
                || $byTrigger[$variant][$trigger]->isGreaterThan($triggerNeed)
                || $byVariant[$variant]->isGreaterThan($proposed);

            $reason = $line['additional_purchase_reason'];
            if ($reason !== null) {
                $inbound = array_column($item['inbound_sources'], null, 'source_id');
                $coverageState = explode('_', $reason['category'])[0];
                foreach ($reason['referenced_source_ids'] as $id) {
                    if (($inbound[$id]['coverage_state'] ?? null) !== $coverageState) {
                        throw RepfWorkflow::conflict('source_not_eligible', 'The identified supply source does not qualify for the additional purchase reason.');
                    }
                }
            }

            if ($exceeds && $reason === null) {
                $conflicts[] = [
                    'line_index' => $index,
                    'trigger_kind' => $trigger,
                    'variant_id' => $variant,
                    'requested_quantity' => $line['requested_quantity'],
                    'live_uncovered_need' => (string) $lineNeed,
                    'variant_proposed_uncovered_quantity' => $proposed,
                    'blocking_inbound_sources' => array_values(array_slice(array_filter(
                        $item['inbound_sources'], fn (array $source) => $source['coverage_state'] === 'counted',
                    ), 0, 50)),
                ];
            }
            $breakdowns[] = Arr::only($item, self::BREAKDOWN_FIELDS) + [
                'snapshot_version' => $result['snapshot_version'],
                'observed_at' => $result['observed_at'],
                'variant_proposed_uncovered_quantity' => $proposed,
                'uncovered_need' => (string) $lineNeed,
                'exceeds_uncovered_need' => $exceeds,
            ];
        }

        if ($conflicts !== []) {
            throw RepfWorkflow::conflict('duplicate_supply_coverage', 'Requested quantities exceed live uncovered need.', coverage: $conflicts);
        }

        return $breakdowns;
    }
}
