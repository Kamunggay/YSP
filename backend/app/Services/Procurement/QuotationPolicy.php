<?php

namespace App\Services\Procurement;

use App\Exceptions\ContractException;
use App\Models\PolicyRecord;
use App\Services\Authority\ChapterAuthority;
use Brick\Math\BigDecimal;

final class QuotationPolicy
{
    /**
     * Evaluate effective chapter purchasing_quotation_policy for an amount, quote count, and waiver state.
     *
     * @return array<string, mixed>
     */
    public static function evaluate(
        string $chapterId,
        string $amountPhp,
        int $comparableCount,
        bool $waiverRequested,
        ?array $current = null,
    ): array {
        $at = now();
        $policies = PolicyRecord::where('chapter_id', $chapterId)
            ->where('policy_code', 'purchasing_quotation_policy')
            ->orderBy('id')->sharedLock()->get()->sortByDesc('policy_version');
        $policy = $policies->first(fn (PolicyRecord $row) => ChapterAuthority::policyState(
            $row, 'CHAPTER_HEAD', 'PurchasingQuotationPolicyValue', at: $at
        ) === 'effective');

        if (! $policy) {
            $blocker = ChapterAuthority::policyBlocker(
                $policies, 'purchasing_quotation_policy', 'CHAPTER_HEAD', 'PurchasingQuotationPolicyValue', at: $at
            );
            throw self::conflict('setup_blocked', 'Effective chapter purchasing_quotation_policy is required.', $current, [$blocker]);
        }

        $amount = BigDecimal::of($amountPhp)->toScale(2);
        $tier = null;
        foreach ($policy->rules_json['tiers'] ?? [] as $candidate) {
            $aboveMin = $amount->compareTo($candidate['min_amount_php']) >= 0;
            $belowMax = $candidate['max_amount_php'] === null || $amount->compareTo($candidate['max_amount_php']) <= 0;
            if ($aboveMin && $belowMax) {
                $tier = $candidate;
                break;
            }
        }
        if ($tier === null) {
            $blocker = ChapterAuthority::setupBlocker('purchasing_quotation_policy', 'CHAPTER_HEAD', 'missing');
            throw self::conflict('setup_blocked', 'No purchasing_quotation_policy tier covers this PHP amount.', $current, [$blocker]);
        }

        $waiver = $policy->rules_json['emergency_waiver'];
        $required = (int) $tier['minimum_comparable_quotes'];
        $permitted = (bool) $waiver['permitted'];
        $minWaived = $waiver['minimum_quotes_when_waived'];
        $waiverUsed = $waiverRequested && $permitted;

        $evaluation = [
            'policy_id' => $policy->aggregate_id ?? $policy->id,
            'policy_version' => (int) $policy->policy_version,
            'evaluated_amount_php' => (string) $amount,
            'applicable_tier_min_php' => $tier['min_amount_php'],
            'applicable_tier_max_php' => $tier['max_amount_php'],
            'required_minimum_quotes' => $required,
            'comparable_quote_count' => $comparableCount,
            'waiver_permitted' => $permitted,
            'minimum_quotes_when_waived' => $minWaived,
            'emergency_waiver_used' => $waiverUsed,
            'approving_duties_for_waiver' => array_values($waiver['approving_duties'] ?? []),
        ];

        $tierMet = $comparableCount >= $required;
        $waiverMet = $waiverRequested && $permitted && ($minWaived === null || $comparableCount >= (int) $minWaived);
        if (($waiverRequested && ! $permitted) || (! $tierMet && ! $waiverMet)) {
            throw self::conflict(
                'quotation_policy_unmet',
                'Comparable quotations do not satisfy the effective purchasing_quotation_policy tier.',
                $current,
                [],
                $evaluation,
            );
        }

        return $evaluation;
    }

    public static function conflict(
        string $code,
        string $message,
        ?array $current = null,
        array $blockers = [],
        ?array $evaluation = null,
    ): ContractException {
        return new ContractException(409, $code, $message, [
            'failed_intent_committed' => false,
            'current' => $current,
            'setup_blockers' => $blockers,
            'policy_evaluation' => $evaluation,
        ]);
    }
}
