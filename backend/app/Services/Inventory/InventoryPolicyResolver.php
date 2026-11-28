<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Exceptions\ContractException;
use App\Models\PolicyRecord;
use App\Services\Authority\ChapterAuthority;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Resolves controlled-setup inventory policies (quantity_scale, rop, target_level,
 * allocation_priority) consistently with Stage 1 ChapterAuthority::policyState().
 */
final class InventoryPolicyResolver
{
    private const OWNER = 'CHAPTER_HEAD';

    /** @return Collection<int, PolicyRecord> */
    public function lockChapterPolicies(ChapterAuthority $authority, array $policyCodes): Collection
    {
        return $authority->chapter->policyRecords()
            ->whereIn('policy_code', $policyCodes)
            ->orderByDesc('policy_version')
            ->orderBy('id')
            ->sharedLock()
            ->get();
    }

    /**
     * @param  Collection<int, PolicyRecord>  $policies
     * @return array{
     *   effective: bool,
     *   scale: int|null,
     *   unit_id: string|null,
     *   policy_ref: array{policy_id: string, version: int}|null,
     *   blocker: array<string, mixed>|null
     * }
     */
    public function resolveQuantityScale(ChapterAuthority $authority, Collection $policies, string $variantId): array
    {
        $resolved = $this->resolveSubjectPolicy(
            $authority,
            $policies,
            'quantity_scale',
            'CatalogueQuantityPolicyValue',
            $variantId,
            fn (PolicyRecord $record) => [
                'scale' => (int) ($record->rules_json['quantity_scale'] ?? 0),
                'unit_id' => $record->rules_json['unit_id'] ?? null,
            ],
            'Effective approved quantity_scale policy is required for this variant.'
        );

        return [
            'effective' => $resolved['effective'],
            'scale' => $resolved['effective'] ? $resolved['data']['scale'] : null,
            'unit_id' => $resolved['effective'] ? $resolved['data']['unit_id'] : null,
            'policy_ref' => $resolved['policy_ref'],
            'blocker' => $resolved['blocker'],
        ];
    }

    /**
     * Resolve effective chapter-level allocation_priority policy + unit ranks + active overrides.
     * Throws 409 setup_blocked when missing/unapproved/not_effective/expired.
     *
     * @param  Collection<int, PolicyRecord>  $policies
     * @return array{
     *   policy_ref: array{policy_id: string, version: int},
     *   unit_ranks: array<string, int>,
     *   active_overrides: array<string, array<string, mixed>>
     * }
     */
    public function requireAllocationPriority(
        ChapterAuthority $authority,
        Collection $policies,
        ?CarbonImmutable $observedAt = null
    ): array {
        $resolved = $this->resolveSubjectPolicy(
            $authority,
            $policies,
            'allocation_priority',
            'AllocationPriorityPolicyValue',
            null,
            fn (PolicyRecord $record) => $record->rules_json ?? [],
            'Effective approved allocation_priority policy is required to inspect the allocation queue.'
        );

        if (! $resolved['effective']) {
            throw new ContractException(
                409,
                'setup_blocked',
                'Required allocation priority policy is not effective for this chapter.',
                ['blockers' => [$resolved['blocker']]]
            );
        }

        $now = ($observedAt ?? CarbonImmutable::now('UTC'))->utc();
        $rules = $resolved['data'];
        $policyId = $resolved['policy_ref']['policy_id'];

        $unitRanks = [];
        foreach ($rules['priorities'] ?? [] as $entry) {
            if (is_array($entry) && isset($entry['requesting_unit_id'], $entry['rank'])) {
                $unitRanks[(string) $entry['requesting_unit_id']] = (int) $entry['rank'];
            }
        }

        $activeOverrides = [];
        foreach ($rules['overrides'] ?? [] as $override) {
            if (! is_array($override) || ! isset($override['rf_line_id'], $override['expires_at'])) {
                continue;
            }
            $expiresAt = CarbonImmutable::parse((string) $override['expires_at'])->utc();
            if ($expiresAt->gt($now)) {
                $activeOverrides[(string) $override['rf_line_id']] = [
                    'override_policy_id' => $policyId,
                    'rf_id' => (string) ($override['rf_id'] ?? ''),
                    'rf_line_id' => (string) $override['rf_line_id'],
                    'expires_at' => $expiresAt->format('Y-m-d\TH:i:s.u\Z'),
                ];
            }
        }

        return [
            'policy_ref' => $resolved['policy_ref'],
            'unit_ranks' => $unitRanks,
            'active_overrides' => $activeOverrides,
        ];
    }

    /**
     * @param  Collection<int, PolicyRecord>  $policies
     * @param  callable(PolicyRecord): array<string, mixed>  $extractor
     * @return array{
     *   effective: bool,
     *   data: array<string, mixed>,
     *   policy_ref: array{policy_id: string, version: int}|null,
     *   blocker: array<string, mixed>|null
     * }
     */
    private function resolveSubjectPolicy(
        ChapterAuthority $authority,
        Collection $policies,
        string $policyCode,
        string $schema,
        ?string $subjectId,
        callable $extractor,
        string $blockerMessage,
    ): array {
        $matching = [];
        foreach ($policies->where('policy_code', $policyCode) as $policy) {
            $state = $authority->policyState($policy, self::OWNER, $schema, $subjectId);
            if ($state !== null) {
                $matching[] = ['policy' => $policy, 'state' => $state];
            }
        }

        foreach (['effective', 'not_effective', 'expired', 'unapproved'] as $targetState) {
            foreach ($matching as $candidate) {
                if ($candidate['state'] !== $targetState) {
                    continue;
                }
                /** @var PolicyRecord $record */
                $record = $candidate['policy'];
                if ($targetState === 'effective') {
                    return [
                        'effective' => true,
                        'data' => $extractor($record),
                        'policy_ref' => [
                            'policy_id' => (string) ($record->aggregate_id ?? $record->id),
                            'version' => (int) $record->policy_version,
                        ],
                        'blocker' => null,
                    ];
                }

                return [
                    'effective' => false,
                    'data' => [],
                    'policy_ref' => null,
                    'blocker' => [
                        'setting_key' => $policyCode,
                        'subject_id' => $subjectId,
                        'state' => $targetState,
                        'approval_owner' => self::OWNER,
                        'message' => $blockerMessage,
                    ],
                ];
            }
        }

        return [
            'effective' => false,
            'data' => [],
            'policy_ref' => null,
            'blocker' => [
                'setting_key' => $policyCode,
                'subject_id' => $subjectId,
                'state' => 'missing',
                'approval_owner' => self::OWNER,
                'message' => $blockerMessage,
            ],
        ];
    }
}
