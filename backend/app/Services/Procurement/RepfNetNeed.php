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
        $variants = array_values(array_unique(array_column($lines, 'variant_id')));
        $ropVariants = $enforce ? array_values(array_unique(array_column(array_filter(
            $lines, fn (array $line) => $line['trigger_kind'] === 'rop_replenishment',
        ), 'variant_id'))) : [];
        $observedAt = now('UTC')->format('Y-m-d\\TH:i:s.u\\Z');
        $includeRfLines = in_array('rf_shortage', array_column($lines, 'trigger_kind'), true);
        $items = [];
        foreach ([
            [array_values(array_diff($variants, $ropVariants)), false],
            [$ropVariants, true],
        ] as [$ids, $requireRop]) {
            if ($ids === []) {
                continue;
            }
            $result = $this->fetch([
                'chapter_id' => $chapterId,
                'actor_id' => $actorId,
                'observed_at' => $observedAt,
                'variant_ids' => $ids,
                'include_rf_line_breakdown' => $includeRfLines,
                'require_rop_and_target_policies' => $requireRop,
                'exclude_repf_id' => $repfId,
            ]);
            foreach ($result['items'] as $item) {
                $items[$item['variant_id']] = $item + ['snapshot_version' => $result['snapshot_version']];
            }
        }

        if (! $enforce) {
            return [];
        }

        $byTrigger = [];
        $byVariant = [];
        foreach ($lines as $line) {
            // Reserve ordinary coverage for lines without an additional-purchase reason.
            if ($line['additional_purchase_reason'] !== null) {
                continue;
            }
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
            $reason = $line['additional_purchase_reason'];
            $exceeds = $reason === null && (
                $lineNeed->isLessThan($line['requested_quantity'])
                || $byTrigger[$variant][$trigger]->isGreaterThan($triggerNeed)
                || $byVariant[$variant]->isGreaterThan($proposed)
            );
            if ($reason !== null) {
                $inbound = array_column($item['inbound_sources'], null, 'source_id');
                $coverageState = explode('_', $reason['category'])[0];
                foreach ($reason['referenced_source_ids'] as $id) {
                    $source = $inbound[$id] ?? throw RepfWorkflow::notFound();
                    if ($source['coverage_state'] !== $coverageState) {
                        throw RepfWorkflow::conflict('source_not_eligible', 'The identified supply source does not qualify for the additional purchase reason.');
                    }
                }
            }

            if ($exceeds) {
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
                'snapshot_version' => $item['snapshot_version'],
                'observed_at' => $item['observed_at'],
                'variant_proposed_uncovered_quantity' => $proposed,
                'uncovered_need' => $triggerNeed,
                'exceeds_uncovered_need' => BigDecimal::of($line['requested_quantity'])->isGreaterThan($triggerNeed),
            ];
        }

        if ($conflicts !== []) {
            throw RepfWorkflow::conflict('duplicate_supply_coverage', 'Requested quantities exceed live uncovered need.', coverage: $conflicts);
        }

        return $breakdowns;
    }

    private function fetch(array $input): array
    {
        $result = $this->participant->computeNetShortageSnapshot($input);

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

        return $result;
    }
}
