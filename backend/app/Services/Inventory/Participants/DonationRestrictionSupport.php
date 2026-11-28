<?php

namespace App\Services\Inventory\Participants;

use App\Http\Requests\AuthInput;
use Carbon\CarbonImmutable;
use Throwable;

/**
 * Closed BoundedRestriction / DonationRestriction / DonationAppliedRestriction validator and canonicalizer.
 */
final class DonationRestrictionSupport
{
    private const REQUIRED_KEYS = [
        'state',
        'allowed_uses',
        'event_ids',
        'requesting_unit_ids',
        'effective_from',
        'effective_until',
        'interpretation_id',
        'source_condition_reference',
    ];

    private const ALLOWED_STATES = ['unrestricted', 'bounded', 'uninterpreted'];

    private const ALLOWED_USES = ['internal_use', 'sale', 'booth_custody'];

    private const UTC_INSTANT_PATTERN = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/';

    public static function isStrictlyUnrestricted(mixed $restrictions): bool
    {
        if (! is_array($restrictions) || ! self::hasExactKeys($restrictions, self::REQUIRED_KEYS)) {
            return false;
        }

        return ($restrictions['state'] ?? null) === 'unrestricted'
            && $restrictions['allowed_uses'] === []
            && $restrictions['event_ids'] === []
            && $restrictions['requesting_unit_ids'] === []
            && $restrictions['effective_from'] === null
            && $restrictions['effective_until'] === null
            && $restrictions['interpretation_id'] === null
            && $restrictions['source_condition_reference'] === null;
    }

    /**
     * Validate DonationRestriction or DonationAppliedRestriction against Stage 2 OpenAPI schemas.
     *
     * @param  list<string>  $allowedStates
     */
    public static function isValid(
        mixed $restrictions,
        array $allowedStates = self::ALLOWED_STATES,
        bool $requireInterpretationIdWhenBounded = false
    ): bool {
        if (! is_array($restrictions) || ! self::hasExactKeys($restrictions, self::REQUIRED_KEYS)) {
            return false;
        }

        $state = $restrictions['state'] ?? null;
        if (! is_string($state) || ! in_array($state, $allowedStates, true)) {
            return false;
        }

        if ($state === 'unrestricted') {
            return self::isStrictlyUnrestricted($restrictions);
        }

        $ref = $restrictions['source_condition_reference'] ?? null;
        if (! is_string($ref) || trim($ref) === '' || strlen($ref) > 200) {
            return false;
        }

        if ($state === 'uninterpreted') {
            return $restrictions['allowed_uses'] === []
                && $restrictions['event_ids'] === []
                && $restrictions['requesting_unit_ids'] === []
                && $restrictions['effective_from'] === null
                && $restrictions['effective_until'] === null
                && $restrictions['interpretation_id'] === null;
        }

        if (! self::isValidAllowedUses($restrictions['allowed_uses'] ?? null)) {
            return false;
        }

        if (! self::isValidUuidList($restrictions['event_ids'] ?? null)
            || ! self::isValidUuidList($restrictions['requesting_unit_ids'] ?? null)) {
            return false;
        }

        if (! self::isValidInstant($restrictions['effective_from'] ?? null)
            || ! self::isValidInstant($restrictions['effective_until'] ?? null)) {
            return false;
        }

        if (($restrictions['effective_from'] ?? null) !== null && ($restrictions['effective_until'] ?? null) !== null) {
            $from = CarbonImmutable::parse($restrictions['effective_from']);
            $until = CarbonImmutable::parse($restrictions['effective_until']);
            if ($until->lt($from)) {
                return false;
            }
        }

        $interp = $restrictions['interpretation_id'] ?? null;
        if ($requireInterpretationIdWhenBounded) {
            return self::isUuid($interp);
        }

        return $interp === null || self::isUuid($interp);
    }

    /**
     * Canonicalize collection fields (`allowed_uses`, `event_ids`, `requesting_unit_ids`) as sorted unique lists.
     *
     * @param  array<string, mixed>  $restrictions
     * @return array<string, mixed>
     */
    public static function canonicalize(array $restrictions): array
    {
        $out = $restrictions;
        foreach (['allowed_uses', 'event_ids', 'requesting_unit_ids'] as $listKey) {
            $list = array_values(array_unique(array_map('strval', $out[$listKey] ?? [])));
            sort($list);
            $out[$listKey] = $list;
        }

        return $out;
    }

    /**
     * Compare two BoundedRestriction arrays after normalizing set fields.
     *
     * @param  array<string, mixed>  $left
     * @param  array<string, mixed>  $right
     */
    public static function equals(array $left, array $right): bool
    {
        $normLeft = self::canonicalize($left);
        $normRight = self::canonicalize($right);

        foreach (self::REQUIRED_KEYS as $key) {
            if (($normLeft[$key] ?? null) !== ($normRight[$key] ?? null)) {
                return false;
            }
        }

        return true;
    }

    /** @param list<string> $requiredKeys */
    public static function hasExactKeys(array $data, array $requiredKeys): bool
    {
        $keys = array_keys($data);
        sort($keys);
        $expected = $requiredKeys;
        sort($expected);

        return $keys === $expected;
    }

    public static function isUuid(mixed $value): bool
    {
        return is_string($value) && preg_match(AuthInput::UUID, $value) === 1;
    }

    private static function isValidAllowedUses(mixed $uses): bool
    {
        if (! is_array($uses) || ! array_is_list($uses) || count($uses) > 3) {
            return false;
        }

        foreach ($uses as $use) {
            if (! is_string($use) || ! in_array($use, self::ALLOWED_USES, true)) {
                return false;
            }
        }

        return count(array_unique($uses)) === count($uses);
    }

    private static function isValidUuidList(mixed $items): bool
    {
        if (! is_array($items) || ! array_is_list($items) || count($items) > 100) {
            return false;
        }

        foreach ($items as $item) {
            if (! self::isUuid($item)) {
                return false;
            }
        }

        return true;
    }

    private static function isValidInstant(mixed $value): bool
    {
        if ($value === null) {
            return true;
        }
        if (! is_string($value) || preg_match(self::UTC_INSTANT_PATTERN, $value) !== 1) {
            return false;
        }

        try {
            CarbonImmutable::parse($value);

            return true;
        } catch (Throwable) {
            return false;
        }
    }
}
