<?php

namespace App\Http\Requests;

use App\Exceptions\ContractException;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use JsonException;
use stdClass;

final class OpeningDraftInput
{
    public const STOCK_QTY = '/\A(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?\z/';

    public const PHP_MONEY = '/\A(0|[1-9][0-9]{0,11})\.[0-9]{2}\z/';

    public const UTC_INSTANT = '/\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z\z/';

    public const CONDITIONS = ['usable', 'damaged', 'rejected'];

    public const POLICY_KEYS = ['ipc_authorization', 'valuation_rounding', 'reference_series'];

    public const ALLOWED_USES = ['internal_use', 'sale', 'booth_custody'];

    public const RESTRICTION_STATES = ['unrestricted', 'bounded', 'uninterpreted'];

    /** @return array{string, array<string, mixed>} */
    public static function parseWrite(Request $request, callable $validator): array
    {
        if ($request->server('QUERY_STRING', '') !== '') {
            throw self::malformed('Query parameters are not allowed on this operation.');
        }

        $keys = $request->headers->all('X-Action-Key');
        if (count($keys) !== 1 || ! preg_match(AuthInput::UUID, (string) $keys[0])) {
            throw self::malformed('Supply a valid X-Action-Key UUID header.');
        }

        $contentType = strtolower(trim(explode(';', (string) $request->header('Content-Type', ''), 2)[0]));
        if ($contentType !== 'application/json') {
            throw new ContractException(415, 'unsupported_media_type', 'Use application/json.');
        }

        try {
            $body = AuthInput::decode($request);
        } catch (JsonException) {
            throw self::malformed('Request body must be valid JSON without duplicate properties.');
        }

        $errors = [];
        if (! $body instanceof stdClass) {
            $errors[] = self::field('', 'invalid_type', 'Request must be a JSON object.');
            throw self::invalidInput($errors);
        }

        $validated = $validator($body, $errors);
        if ($errors !== []) {
            throw self::invalidInput($errors);
        }

        return [(string) $keys[0], $validated];
    }

    /** @param list<string> $allowed
     * @return array<string, string>
     */
    public static function selectors(Request $request, array $allowed = []): array
    {
        if ($request->getContent() !== '' || $request->headers->has('X-Action-Key')) {
            throw new ContractException(400, 'invalid_selector', 'Invalid selector or unexpected request body.');
        }

        $query = (string) $request->server('QUERY_STRING', '');
        $selectors = [];
        foreach ($query === '' ? [] : explode('&', $query) as $part) {
            [$rawKey, $rawVal] = array_pad(explode('=', $part, 2), 2, '');
            $key = urldecode($rawKey);
            if ($rawKey !== $key || ! in_array($key, $allowed, true) || isset($selectors[$key]) || $rawVal === '') {
                throw new ContractException(400, 'invalid_selector', 'Invalid query selector.');
            }
            $selectors[$key] = urldecode($rawVal);
        }

        return $selectors;
    }

    public static function requireUuid(string $value, string $label = 'identifier'): string
    {
        if (! preg_match(AuthInput::UUID, $value)) {
            throw new ContractException(400, 'invalid_selector', "Invalid {$label}.");
        }

        return $value;
    }

    public static function requireRevision(string $value): int
    {
        if (! preg_match('/\A[1-9][0-9]{0,9}\z/', $value)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid revision selector.');
        }
        $int = (int) $value;
        if ($int < 1 || $int > 2147483647) {
            throw new ContractException(400, 'invalid_selector', 'Invalid revision selector.');
        }

        return $int;
    }

    /** @return array<string, mixed> */
    public static function validateCreateIpc(stdClass $body, array &$errors): array
    {
        $vals = self::checkObjectKeys($body, ['material'], '', $errors);
        $material = array_key_exists('material', $vals)
            ? self::validateIpcMaterial($vals['material'], '/material', $errors)
            : [];

        return ['material' => $material];
    }

    /** @return array<string, mixed> */
    public static function validateReplaceIpc(stdClass $body, array &$errors): array
    {
        $vals = self::checkObjectKeys($body, ['expected_revision', 'reason', 'material'], '', $errors);

        return [
            'expected_revision' => self::checkInt($vals['expected_revision'] ?? null, array_key_exists('expected_revision', $vals), '/expected_revision', 1, 2147483647, $errors),
            'reason' => self::checkString($vals['reason'] ?? null, array_key_exists('reason', $vals), '/reason', 500, false, true, $errors),
            'material' => array_key_exists('material', $vals)
                ? self::validateIpcMaterial($vals['material'], '/material', $errors)
                : [],
        ];
    }

    /** @return array<string, mixed> */
    public static function validateSaveIpcCount(stdClass $body, array &$errors): array
    {
        $vals = self::checkObjectKeys($body, ['expected_revision', 'material_version', 'counted_at', 'completed', 'signed_at', 'entries'], '', $errors);
        $entries = [];
        if (array_key_exists('entries', $vals)) {
            $list = self::checkList($vals['entries'], '/entries', $errors);
            foreach ($list as $i => $entry) {
                $entries[] = self::validateCountEntry($entry, "/entries/{$i}", $errors);
            }
        }

        return [
            'expected_revision' => self::checkInt($vals['expected_revision'] ?? null, array_key_exists('expected_revision', $vals), '/expected_revision', 1, 2147483647, $errors),
            'material_version' => self::checkInt($vals['material_version'] ?? null, array_key_exists('material_version', $vals), '/material_version', 1, 2147483647, $errors),
            'counted_at' => self::checkInstant($vals['counted_at'] ?? null, array_key_exists('counted_at', $vals), '/counted_at', true, $errors),
            'completed' => self::checkBool($vals['completed'] ?? null, array_key_exists('completed', $vals), '/completed', $errors),
            'signed_at' => self::checkInstant($vals['signed_at'] ?? null, array_key_exists('signed_at', $vals), '/signed_at', true, $errors),
            'entries' => $entries,
        ];
    }

    /** @return array<string, mixed> */
    public static function validateCreateOpeningRm(stdClass $body, array &$errors): array
    {
        $vals = self::checkObjectKeys($body, ['ipc_id', 'material'], '', $errors);

        return [
            'ipc_id' => self::checkUuid($vals['ipc_id'] ?? null, array_key_exists('ipc_id', $vals), '/ipc_id', false, $errors),
            'material' => array_key_exists('material', $vals)
                ? self::validateOpeningRmMaterial($vals['material'], '/material', $errors)
                : [],
        ];
    }

    /** @return array<string, mixed> */
    public static function validateReplaceOpeningRm(stdClass $body, array &$errors): array
    {
        $vals = self::checkObjectKeys($body, ['expected_revision', 'reason', 'material'], '', $errors);

        return [
            'expected_revision' => self::checkInt($vals['expected_revision'] ?? null, array_key_exists('expected_revision', $vals), '/expected_revision', 1, 2147483647, $errors),
            'reason' => self::checkString($vals['reason'] ?? null, array_key_exists('reason', $vals), '/reason', 500, false, true, $errors),
            'material' => array_key_exists('material', $vals)
                ? self::validateOpeningRmMaterial($vals['material'], '/material', $errors)
                : [],
        ];
    }

    /** @return array<string, mixed> */
    private static function validateIpcMaterial(mixed $raw, string $ptr, array &$errors): array
    {
        if (! $raw instanceof stdClass) {
            $errors[] = self::field($ptr, 'invalid_type', 'Object required.');

            return [];
        }
        $vals = self::checkObjectKeys($raw, ['cutoff_at', 'informal_movements_suspended', 'count_team', 'policies', 'lines', 'notes'], $ptr, $errors);

        $team = [];
        if (array_key_exists('count_team', $vals)) {
            foreach (self::checkList($vals['count_team'], $ptr.'/count_team', $errors) as $i => $member) {
                $team[] = self::validateTeamMember($member, "{$ptr}/count_team/{$i}", $errors);
            }
        }

        $policies = [];
        if (array_key_exists('policies', $vals)) {
            foreach (self::checkList($vals['policies'], $ptr.'/policies', $errors) as $i => $policy) {
                $policies[] = self::validatePolicyBinding($policy, "{$ptr}/policies/{$i}", $errors);
            }
        }

        $lines = [];
        if (array_key_exists('lines', $vals)) {
            foreach (self::checkList($vals['lines'], $ptr.'/lines', $errors) as $i => $line) {
                $lines[] = self::validateIpcLine($line, "{$ptr}/lines/{$i}", $errors);
            }
        }

        return [
            'cutoff_at' => self::checkInstant($vals['cutoff_at'] ?? null, array_key_exists('cutoff_at', $vals), $ptr.'/cutoff_at', true, $errors),
            'informal_movements_suspended' => self::checkBool($vals['informal_movements_suspended'] ?? null, array_key_exists('informal_movements_suspended', $vals), $ptr.'/informal_movements_suspended', $errors),
            'count_team' => $team,
            'policies' => $policies,
            'lines' => $lines,
            'notes' => self::checkString($vals['notes'] ?? null, array_key_exists('notes', $vals), $ptr.'/notes', 500, true, false, $errors),
        ];
    }

    /** @return array<string, mixed> */
    private static function validateTeamMember(mixed $raw, string $ptr, array &$errors): array
    {
        if (! $raw instanceof stdClass) {
            $errors[] = self::field($ptr, 'invalid_type', 'Object required.');

            return [];
        }
        $vals = self::checkObjectKeys($raw, ['user_id', 'regular_custodian'], $ptr, $errors);

        return [
            'user_id' => self::checkUuid($vals['user_id'] ?? null, array_key_exists('user_id', $vals), $ptr.'/user_id', false, $errors),
            'regular_custodian' => self::checkBool($vals['regular_custodian'] ?? null, array_key_exists('regular_custodian', $vals), $ptr.'/regular_custodian', $errors),
        ];
    }

    /** @return array<string, mixed> */
    private static function validatePolicyBinding(mixed $raw, string $ptr, array &$errors): array
    {
        if (! $raw instanceof stdClass) {
            $errors[] = self::field($ptr, 'invalid_type', 'Object required.');

            return [];
        }
        $vals = self::checkObjectKeys($raw, ['setting_key', 'policy_id', 'version'], $ptr, $errors);

        return [
            'setting_key' => self::checkEnum($vals['setting_key'] ?? null, array_key_exists('setting_key', $vals), $ptr.'/setting_key', self::POLICY_KEYS, false, $errors),
            'policy_id' => self::checkUuid($vals['policy_id'] ?? null, array_key_exists('policy_id', $vals), $ptr.'/policy_id', false, $errors),
            'version' => self::checkInt($vals['version'] ?? null, array_key_exists('version', $vals), $ptr.'/version', 1, 2147483647, $errors),
        ];
    }

    /** @return array<string, mixed> */
    private static function validateIpcLine(mixed $raw, string $ptr, array &$errors): array
    {
        if (! $raw instanceof stdClass) {
            $errors[] = self::field($ptr, 'invalid_type', 'Object required.');

            return [];
        }
        $keys = [
            'line_id', 'item_id', 'variant_id', 'variant_material_version',
            'unit_id', 'unit_material_version', 'quantity_scale', 'historical_variant_label',
            'location_id', 'location_material_version', 'regular_custodian_ids', 'condition',
            'counted_quantity', 'unit_value', 'valuation_basis', 'provenance_reference', 'restrictions',
        ];
        $vals = self::checkObjectKeys($raw, $keys, $ptr, $errors);

        $custodians = [];
        if (array_key_exists('regular_custodian_ids', $vals)) {
            $list = self::checkList($vals['regular_custodian_ids'], $ptr.'/regular_custodian_ids', $errors);
            if ($list === [] && is_array($vals['regular_custodian_ids'])) {
                $errors[] = self::field($ptr.'/regular_custodian_ids', 'invalid_format', 'At least one regular custodian is required.');
            }
            foreach ($list as $i => $cid) {
                $custodians[] = self::checkUuid($cid, true, "{$ptr}/regular_custodian_ids/{$i}", false, $errors);
            }
        }

        return [
            'line_id' => self::checkUuid($vals['line_id'] ?? null, array_key_exists('line_id', $vals), $ptr.'/line_id', false, $errors),
            'item_id' => self::checkUuid($vals['item_id'] ?? null, array_key_exists('item_id', $vals), $ptr.'/item_id', false, $errors),
            'variant_id' => self::checkUuid($vals['variant_id'] ?? null, array_key_exists('variant_id', $vals), $ptr.'/variant_id', false, $errors),
            'variant_material_version' => self::checkInt($vals['variant_material_version'] ?? null, array_key_exists('variant_material_version', $vals), $ptr.'/variant_material_version', 1, 2147483647, $errors),
            'unit_id' => self::checkUuid($vals['unit_id'] ?? null, array_key_exists('unit_id', $vals), $ptr.'/unit_id', false, $errors),
            'unit_material_version' => self::checkInt($vals['unit_material_version'] ?? null, array_key_exists('unit_material_version', $vals), $ptr.'/unit_material_version', 1, 2147483647, $errors),
            'quantity_scale' => self::checkInt($vals['quantity_scale'] ?? null, array_key_exists('quantity_scale', $vals), $ptr.'/quantity_scale', 0, 6, $errors),
            'historical_variant_label' => self::checkString($vals['historical_variant_label'] ?? null, array_key_exists('historical_variant_label', $vals), $ptr.'/historical_variant_label', 120, false, false, $errors),
            'location_id' => self::checkUuid($vals['location_id'] ?? null, array_key_exists('location_id', $vals), $ptr.'/location_id', false, $errors),
            'location_material_version' => self::checkInt($vals['location_material_version'] ?? null, array_key_exists('location_material_version', $vals), $ptr.'/location_material_version', 1, 2147483647, $errors),
            'regular_custodian_ids' => $custodians,
            'condition' => self::checkEnum($vals['condition'] ?? null, array_key_exists('condition', $vals), $ptr.'/condition', self::CONDITIONS, false, $errors),
            'counted_quantity' => self::checkPattern($vals['counted_quantity'] ?? null, array_key_exists('counted_quantity', $vals), $ptr.'/counted_quantity', self::STOCK_QTY, true, $errors),
            'unit_value' => self::checkPattern($vals['unit_value'] ?? null, array_key_exists('unit_value', $vals), $ptr.'/unit_value', self::PHP_MONEY, true, $errors),
            'valuation_basis' => self::checkString($vals['valuation_basis'] ?? null, array_key_exists('valuation_basis', $vals), $ptr.'/valuation_basis', 500, true, false, $errors),
            'provenance_reference' => self::checkString($vals['provenance_reference'] ?? null, array_key_exists('provenance_reference', $vals), $ptr.'/provenance_reference', 200, true, false, $errors),
            'restrictions' => array_key_exists('restrictions', $vals)
                ? self::validateRestrictions($vals['restrictions'], $ptr.'/restrictions', $errors)
                : [],
        ];
    }

    /** @return array<string, mixed> */
    private static function validateRestrictions(mixed $raw, string $ptr, array &$errors): array
    {
        if (! $raw instanceof stdClass) {
            $errors[] = self::field($ptr, 'invalid_type', 'Object required.');

            return [];
        }
        $keys = [
            'state', 'allowed_uses', 'event_ids', 'requesting_unit_ids',
            'effective_from', 'effective_until', 'interpretation_id', 'source_condition_reference',
        ];
        $vals = self::checkObjectKeys($raw, $keys, $ptr, $errors);

        $uses = [];
        if (array_key_exists('allowed_uses', $vals)) {
            $list = self::checkList($vals['allowed_uses'], $ptr.'/allowed_uses', $errors, 3);
            foreach ($list as $i => $use) {
                $uses[] = self::checkEnum($use, true, "{$ptr}/allowed_uses/{$i}", self::ALLOWED_USES, false, $errors);
            }
        }
        $events = [];
        if (array_key_exists('event_ids', $vals)) {
            foreach (self::checkList($vals['event_ids'], $ptr.'/event_ids', $errors, 100) as $i => $eid) {
                $events[] = self::checkUuid($eid, true, "{$ptr}/event_ids/{$i}", false, $errors);
            }
        }
        $units = [];
        if (array_key_exists('requesting_unit_ids', $vals)) {
            foreach (self::checkList($vals['requesting_unit_ids'], $ptr.'/requesting_unit_ids', $errors, 100) as $i => $uid) {
                $units[] = self::checkUuid($uid, true, "{$ptr}/requesting_unit_ids/{$i}", false, $errors);
            }
        }

        return [
            'state' => self::checkEnum($vals['state'] ?? null, array_key_exists('state', $vals), $ptr.'/state', self::RESTRICTION_STATES, false, $errors),
            'allowed_uses' => $uses,
            'event_ids' => $events,
            'requesting_unit_ids' => $units,
            'effective_from' => self::checkInstant($vals['effective_from'] ?? null, array_key_exists('effective_from', $vals), $ptr.'/effective_from', true, $errors),
            'effective_until' => self::checkInstant($vals['effective_until'] ?? null, array_key_exists('effective_until', $vals), $ptr.'/effective_until', true, $errors),
            'interpretation_id' => self::checkUuid($vals['interpretation_id'] ?? null, array_key_exists('interpretation_id', $vals), $ptr.'/interpretation_id', true, $errors),
            'source_condition_reference' => self::checkString($vals['source_condition_reference'] ?? null, array_key_exists('source_condition_reference', $vals), $ptr.'/source_condition_reference', 200, true, false, $errors),
        ];
    }

    /** @return array<string, mixed> */
    private static function validateCountEntry(mixed $raw, string $ptr, array &$errors): array
    {
        if (! $raw instanceof stdClass) {
            $errors[] = self::field($ptr, 'invalid_type', 'Object required.');

            return [];
        }
        $vals = self::checkObjectKeys($raw, ['ipc_line_id', 'quantity', 'condition', 'notes'], $ptr, $errors);

        return [
            'ipc_line_id' => self::checkUuid($vals['ipc_line_id'] ?? null, array_key_exists('ipc_line_id', $vals), $ptr.'/ipc_line_id', false, $errors),
            'quantity' => self::checkPattern($vals['quantity'] ?? null, array_key_exists('quantity', $vals), $ptr.'/quantity', self::STOCK_QTY, true, $errors),
            'condition' => self::checkEnum($vals['condition'] ?? null, array_key_exists('condition', $vals), $ptr.'/condition', self::CONDITIONS, true, $errors),
            'notes' => self::checkString($vals['notes'] ?? null, array_key_exists('notes', $vals), $ptr.'/notes', 500, true, false, $errors),
        ];
    }

    /** @return array<string, mixed> */
    private static function validateOpeningRmMaterial(mixed $raw, string $ptr, array &$errors): array
    {
        if (! $raw instanceof stdClass) {
            $errors[] = self::field($ptr, 'invalid_type', 'Object required.');

            return [];
        }
        $vals = self::checkObjectKeys($raw, ['ipc_material_version', 'lines', 'notes'], $ptr, $errors);
        $lines = [];
        if (array_key_exists('lines', $vals)) {
            foreach (self::checkList($vals['lines'], $ptr.'/lines', $errors) as $i => $line) {
                $lines[] = self::validateRmLine($line, "{$ptr}/lines/{$i}", $errors);
            }
        }

        return [
            'ipc_material_version' => self::checkInt($vals['ipc_material_version'] ?? null, array_key_exists('ipc_material_version', $vals), $ptr.'/ipc_material_version', 1, 2147483647, $errors),
            'lines' => $lines,
            'notes' => self::checkString($vals['notes'] ?? null, array_key_exists('notes', $vals), $ptr.'/notes', 500, true, false, $errors),
        ];
    }

    /** @return array<string, mixed> */
    private static function validateRmLine(mixed $raw, string $ptr, array &$errors): array
    {
        if (! $raw instanceof stdClass) {
            $errors[] = self::field($ptr, 'invalid_type', 'Object required.');

            return [];
        }
        $keys = ['ipc_line_id', 'accepted_quantity', 'damaged_quantity', 'rejected_quantity', 'accepted_value', 'finding_reason'];
        $vals = self::checkObjectKeys($raw, $keys, $ptr, $errors);

        return [
            'ipc_line_id' => self::checkUuid($vals['ipc_line_id'] ?? null, array_key_exists('ipc_line_id', $vals), $ptr.'/ipc_line_id', false, $errors),
            'accepted_quantity' => self::checkPattern($vals['accepted_quantity'] ?? null, array_key_exists('accepted_quantity', $vals), $ptr.'/accepted_quantity', self::STOCK_QTY, true, $errors),
            'damaged_quantity' => self::checkPattern($vals['damaged_quantity'] ?? null, array_key_exists('damaged_quantity', $vals), $ptr.'/damaged_quantity', self::STOCK_QTY, true, $errors),
            'rejected_quantity' => self::checkPattern($vals['rejected_quantity'] ?? null, array_key_exists('rejected_quantity', $vals), $ptr.'/rejected_quantity', self::STOCK_QTY, true, $errors),
            'accepted_value' => self::checkPattern($vals['accepted_value'] ?? null, array_key_exists('accepted_value', $vals), $ptr.'/accepted_value', self::PHP_MONEY, true, $errors),
            'finding_reason' => self::checkString($vals['finding_reason'] ?? null, array_key_exists('finding_reason', $vals), $ptr.'/finding_reason', 500, true, false, $errors),
        ];
    }

    /** @param list<string> $required
     * @return array<string, mixed>
     */
    private static function checkObjectKeys(stdClass $obj, array $required, string $prefix, array &$errors): array
    {
        $vals = get_object_vars($obj);
        foreach ($required as $key) {
            if (! array_key_exists($key, $vals)) {
                $errors[] = self::field($prefix.'/'.$key, 'required', "Supply {$key}.");
            }
        }
        foreach (array_diff_key($vals, array_flip($required)) as $extra => $_) {
            $escaped = str_replace(['~', '/'], ['~0', '~1'], (string) $extra);
            $errors[] = self::field($prefix.'/'.$escaped, 'unexpected_field', 'This field is not accepted.');
        }

        return $vals;
    }

    private static function checkInt(mixed $val, bool $present, string $ptr, int $min, int $max, array &$errors): int
    {
        if (! $present) {
            return 0;
        }
        if (! is_int($val)) {
            $errors[] = self::field($ptr, 'invalid_type', 'Integer required.');

            return 0;
        }
        if ($val < $min || $val > $max) {
            $errors[] = self::field($ptr, 'invalid_format', "Integer must be between {$min} and {$max}.");
        }

        return $val;
    }

    private static function checkBool(mixed $val, bool $present, string $ptr, array &$errors): bool
    {
        if (! $present) {
            return false;
        }
        if (! is_bool($val)) {
            $errors[] = self::field($ptr, 'invalid_type', 'Boolean required.');

            return false;
        }

        return $val;
    }

    private static function checkString(mixed $val, bool $present, string $ptr, int $max, bool $nullable, bool $nonblank, array &$errors): ?string
    {
        if (! $present) {
            return null;
        }
        if ($val === null) {
            if (! $nullable) {
                $errors[] = self::field($ptr, 'invalid_type', 'String required.');
            }

            return null;
        }
        if (! is_string($val)) {
            $errors[] = self::field($ptr, 'invalid_type', 'String required.');

            return null;
        }
        if ($val === '' || ($nonblank && trim($val) === '')) {
            $errors[] = self::field($ptr, 'invalid_format', 'Nonempty string required.');
        } elseif (mb_strlen($val) > $max) {
            $errors[] = self::field($ptr, 'too_long', "Must not exceed {$max} characters.");
        }

        return $val;
    }

    private static function checkUuid(mixed $val, bool $present, string $ptr, bool $nullable, array &$errors): ?string
    {
        return self::checkPattern($val, $present, $ptr, AuthInput::UUID, $nullable, $errors);
    }

    private static function checkInstant(mixed $val, bool $present, string $ptr, bool $nullable, array &$errors): ?string
    {
        $checked = self::checkPattern($val, $present, $ptr, self::UTC_INSTANT, $nullable, $errors);
        if ($checked !== null && preg_match(self::UTC_INSTANT, $checked)) {
            try {
                $parsed = CarbonImmutable::createFromFormat('Y-m-d\TH:i:s.u\Z', $checked, 'UTC');
                if (! $parsed || $parsed->format('Y-m-d\TH:i:s.u\Z') !== $checked) {
                    $errors[] = self::field($ptr, 'invalid_format', 'Valid UTC timestamp required.');
                }
            } catch (\Throwable) {
                $errors[] = self::field($ptr, 'invalid_format', 'Valid UTC timestamp required.');
            }
        }

        return $checked;
    }

    private static function checkPattern(mixed $val, bool $present, string $ptr, string $pattern, bool $nullable, array &$errors): ?string
    {
        if (! $present) {
            return null;
        }
        if ($val === null) {
            if (! $nullable) {
                $errors[] = self::field($ptr, 'invalid_type', 'String required.');
            }

            return null;
        }
        if (! is_string($val)) {
            $errors[] = self::field($ptr, 'invalid_type', 'String required.');

            return null;
        }
        if (! preg_match($pattern, $val)) {
            $errors[] = self::field($ptr, 'invalid_format', 'Invalid value format.');
        }

        return $val;
    }

    /** @param list<string> $allowed */
    private static function checkEnum(mixed $val, bool $present, string $ptr, array $allowed, bool $nullable, array &$errors): ?string
    {
        if (! $present) {
            return null;
        }
        if ($val === null) {
            if (! $nullable) {
                $errors[] = self::field($ptr, 'invalid_type', 'String required.');
            }

            return null;
        }
        if (! is_string($val)) {
            $errors[] = self::field($ptr, 'invalid_type', 'String required.');

            return null;
        }
        if (! in_array($val, $allowed, true)) {
            $errors[] = self::field($ptr, 'invalid_format', 'Unsupported value.');
        }

        return $val;
    }

    /** @return list<mixed> */
    private static function checkList(mixed $val, string $ptr, array &$errors, ?int $max = null): array
    {
        if (! is_array($val) || ! array_is_list($val)) {
            $errors[] = self::field($ptr, 'invalid_type', 'Array required.');

            return [];
        }
        if ($max !== null && count($val) > $max) {
            $errors[] = self::field($ptr, 'too_long', "Must not exceed {$max} items.");
        }

        return $val;
    }

    /** @return array{pointer: string, code: string, message: string} */
    private static function field(string $pointer, string $code, string $message): array
    {
        return compact('pointer', 'code', 'message');
    }

    public static function malformed(string $message = 'Malformed request.'): ContractException
    {
        return new ContractException(400, 'malformed_request', $message);
    }

    /** @param list<array{pointer: string, code: string, message: string}> $fields */
    public static function invalidInput(array $fields): ContractException
    {
        return new ContractException(422, 'invalid_input', 'Correct the indicated fields.', [
            'error' => [
                'code' => 'invalid_input',
                'message' => 'Correct the indicated fields.',
                'fields' => $fields,
            ],
        ]);
    }
}
