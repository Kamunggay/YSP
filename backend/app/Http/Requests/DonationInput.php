<?php

namespace App\Http\Requests;

use App\Exceptions\ContractException;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use stdClass;

final class DonationInput
{
    public const STATUSES = [
        'draft', 'pending_acknowledgment', 'returned_for_revision', 'declined',
        'acknowledged', 'partially_received', 'received', 'closed_short', 'canceled',
    ];

    public const ELIGIBLE_FOR = ['receiving', 'restriction_resolution'];

    public const VALUATION_KINDS = ['declared', 'estimated'];

    public const RESOLUTION_KINDS = ['apply', 'audit_review'];

    /** @return array<string, string> */
    public static function selectors(Request $request, array $allowed = []): array
    {
        return RepfInput::selectors($request, $allowed);
    }

    /** @return array{string, array<string, mixed>} */
    public static function write(Request $request, string $operation): array
    {
        return OpeningDraftInput::parseWrite($request, static function (stdClass $raw, array &$errors) use ($operation): array {
            return match ($operation) {
                'createDonation' => self::validateDraft($raw, false, $errors),
                'replaceDonation' => self::validateDraft($raw, true, $errors),
                'submitDonation', 'reviseDonation' => self::validateVersionCheck($raw, $errors),
                'returnDonation', 'declineDonation', 'closeShortDonation', 'cancelDonation' => self::validateReasoned($raw, $errors),
                'acknowledgeDonation' => self::validateAcknowledge($raw, $errors),
                'resolveDonationRestriction' => self::validateResolveRestriction($raw, $errors),
                default => throw new ContractException(400, 'malformed_request', 'Unsupported donation operation.'),
            };
        });
    }

    private static function validateDraft(stdClass $raw, bool $withVersions, array &$errors): array
    {
        $required = $withVersions
            ? ['expected_version', 'expected_material_version', 'donor_name', 'lines']
            : ['donor_name', 'lines'];
        $vals = self::objectKeys($raw, $required, '', $errors);

        $lines = [];
        if (array_key_exists('lines', $vals)) {
            $list = self::listOf($vals['lines'], '/lines', 1, 200, $errors);
            foreach ($list as $index => $line) {
                $lines[] = self::validateLine($line, "/lines/{$index}", $errors);
            }
        }

        $out = [
            'donor_name' => self::text($vals['donor_name'] ?? null, array_key_exists('donor_name', $vals), '/donor_name', 200, false, $errors),
            'lines' => $lines,
        ];
        if ($withVersions) {
            $out = self::versions($vals, $errors) + $out;
        }

        return $out;
    }

    private static function validateVersionCheck(stdClass $raw, array &$errors): array
    {
        $vals = self::objectKeys($raw, ['expected_version', 'expected_material_version'], '', $errors);

        return self::versions($vals, $errors);
    }

    private static function validateReasoned(stdClass $raw, array &$errors): array
    {
        $vals = self::objectKeys($raw, ['expected_version', 'expected_material_version', 'reason'], '', $errors);

        return self::versions($vals, $errors) + [
            'reason' => self::text($vals['reason'] ?? null, array_key_exists('reason', $vals), '/reason', 500, false, $errors),
        ];
    }

    private static function validateAcknowledge(stdClass $raw, array &$errors): array
    {
        $vals = self::objectKeys($raw, ['expected_version', 'expected_material_version', 'evidence', 'signed_at', 'confirm_paper_matches'], '', $errors);

        return self::versions($vals, $errors) + [
            'evidence' => array_key_exists('evidence', $vals) ? self::evidence($vals['evidence'], '/evidence', $errors) : [],
            'signed_at' => self::instant($vals['signed_at'] ?? null, array_key_exists('signed_at', $vals), '/signed_at', false, $errors),
            'confirm_paper_matches' => self::confirmTrue($vals['confirm_paper_matches'] ?? null, array_key_exists('confirm_paper_matches', $vals), '/confirm_paper_matches', $errors),
        ];
    }

    private static function validateResolveRestriction(stdClass $raw, array &$errors): array
    {
        $required = [
            'expected_version', 'expected_material_version', 'evidence', 'signed_at',
            'confirm_paper_matches', 'da_line_id', 'reason', 'resolution_kind', 'restrictions',
        ];
        $vals = self::objectKeys($raw, $required, '', $errors);
        $kind = self::enum($vals['resolution_kind'] ?? null, array_key_exists('resolution_kind', $vals), '/resolution_kind', self::RESOLUTION_KINDS, $errors);
        $restrictions = array_key_exists('restrictions', $vals)
            ? self::restrictions($vals['restrictions'], '/restrictions', $errors)
            : [];

        if ($kind === 'audit_review' && ($restrictions['state'] ?? null) !== null && $restrictions['state'] !== 'uninterpreted') {
            $errors[] = self::field('/restrictions/state', 'invalid_format', 'An audit review keeps the restriction uninterpreted.');
        } elseif ($kind === 'apply' && ($restrictions['state'] ?? null) !== null) {
            if (! in_array($restrictions['state'], ['bounded', 'unrestricted'], true)) {
                $errors[] = self::field('/restrictions/state', 'invalid_format', 'Applied resolutions must set state to bounded or unrestricted.');
            } elseif ($restrictions['state'] === 'bounded' && ($restrictions['interpretation_id'] ?? null) === null) {
                $errors[] = self::field('/restrictions/interpretation_id', 'invalid_format', 'Applied bounded restrictions require an interpretation_id.');
            }
        }

        return self::versions($vals, $errors) + [
            'evidence' => array_key_exists('evidence', $vals) ? self::evidence($vals['evidence'], '/evidence', $errors) : [],
            'signed_at' => self::instant($vals['signed_at'] ?? null, array_key_exists('signed_at', $vals), '/signed_at', false, $errors),
            'confirm_paper_matches' => self::confirmTrue($vals['confirm_paper_matches'] ?? null, array_key_exists('confirm_paper_matches', $vals), '/confirm_paper_matches', $errors),
            'da_line_id' => self::uuid($vals['da_line_id'] ?? null, array_key_exists('da_line_id', $vals), '/da_line_id', false, $errors),
            'reason' => self::text($vals['reason'] ?? null, array_key_exists('reason', $vals), '/reason', 500, false, $errors),
            'resolution_kind' => $kind,
            'restrictions' => $restrictions,
        ];
    }

    private static function validateLine(mixed $raw, string $ptr, array &$errors): array
    {
        if (! $raw instanceof stdClass) {
            $errors[] = self::field($ptr, 'invalid_type', 'A line object is required.');

            return [];
        }
        $keys = [
            'variant_id', 'unit_id', 'pledged_quantity', 'condition_notes',
            'valuation_kind', 'unit_value_php', 'valuation_basis', 'restrictions',
        ];
        $vals = self::objectKeys($raw, $keys, $ptr, $errors);
        $qty = self::pattern($vals['pledged_quantity'] ?? null, array_key_exists('pledged_quantity', $vals), "$ptr/pledged_quantity", OpeningDraftInput::STOCK_QTY, false, $errors);
        if ($qty !== null && preg_match('/\A0(?:\.0+)?\z/', $qty)) {
            $errors[] = self::field("$ptr/pledged_quantity", 'invalid_format', 'Pledged quantity must be greater than zero.');
        }

        return [
            'variant_id' => self::uuid($vals['variant_id'] ?? null, array_key_exists('variant_id', $vals), "$ptr/variant_id", false, $errors),
            'unit_id' => self::uuid($vals['unit_id'] ?? null, array_key_exists('unit_id', $vals), "$ptr/unit_id", false, $errors),
            'pledged_quantity' => $qty,
            'condition_notes' => self::text($vals['condition_notes'] ?? null, array_key_exists('condition_notes', $vals), "$ptr/condition_notes", 500, false, $errors),
            'valuation_kind' => self::enum($vals['valuation_kind'] ?? null, array_key_exists('valuation_kind', $vals), "$ptr/valuation_kind", self::VALUATION_KINDS, $errors),
            'unit_value_php' => self::pattern($vals['unit_value_php'] ?? null, array_key_exists('unit_value_php', $vals), "$ptr/unit_value_php", OpeningDraftInput::PHP_MONEY, false, $errors),
            'valuation_basis' => self::text($vals['valuation_basis'] ?? null, array_key_exists('valuation_basis', $vals), "$ptr/valuation_basis", 500, false, $errors),
            'restrictions' => array_key_exists('restrictions', $vals)
                ? self::restrictions($vals['restrictions'], "$ptr/restrictions", $errors)
                : [],
        ];
    }

    private static function restrictions(mixed $raw, string $ptr, array &$errors): array
    {
        if (! $raw instanceof stdClass) {
            $errors[] = self::field($ptr, 'invalid_type', 'A restriction object is required.');

            return [];
        }
        $keys = [
            'state', 'allowed_uses', 'event_ids', 'requesting_unit_ids',
            'effective_from', 'effective_until', 'interpretation_id', 'source_condition_reference',
        ];
        $vals = self::objectKeys($raw, $keys, $ptr, $errors);
        $state = self::enum($vals['state'] ?? null, array_key_exists('state', $vals), "$ptr/state", OpeningDraftInput::RESTRICTION_STATES, $errors);

        $uses = [];
        if (array_key_exists('allowed_uses', $vals)) {
            $seen = [];
            foreach (self::listOf($vals['allowed_uses'], "$ptr/allowed_uses", 0, 3, $errors) as $i => $use) {
                $checked = self::enum($use, true, "$ptr/allowed_uses/{$i}", OpeningDraftInput::ALLOWED_USES, $errors);
                if ($checked !== null) {
                    if (isset($seen[$checked])) {
                        $errors[] = self::field("$ptr/allowed_uses/{$i}", 'invalid_format', 'Duplicate allowed use.');
                    }
                    $seen[$checked] = true;
                    $uses[] = $checked;
                }
            }
        }
        $events = [];
        if (array_key_exists('event_ids', $vals)) {
            $seen = [];
            foreach (self::listOf($vals['event_ids'], "$ptr/event_ids", 0, 100, $errors) as $i => $eid) {
                $checked = self::uuid($eid, true, "$ptr/event_ids/{$i}", false, $errors);
                if ($checked !== null) {
                    if (isset($seen[$checked])) {
                        $errors[] = self::field("$ptr/event_ids/{$i}", 'invalid_format', 'Duplicate event identifier.');
                    }
                    $seen[$checked] = true;
                    $events[] = $checked;
                }
            }
        }
        $units = [];
        if (array_key_exists('requesting_unit_ids', $vals)) {
            $seen = [];
            foreach (self::listOf($vals['requesting_unit_ids'], "$ptr/requesting_unit_ids", 0, 100, $errors) as $i => $uid) {
                $checked = self::uuid($uid, true, "$ptr/requesting_unit_ids/{$i}", false, $errors);
                if ($checked !== null) {
                    if (isset($seen[$checked])) {
                        $errors[] = self::field("$ptr/requesting_unit_ids/{$i}", 'invalid_format', 'Duplicate requesting unit identifier.');
                    }
                    $seen[$checked] = true;
                    $units[] = $checked;
                }
            }
        }

        $from = self::instant($vals['effective_from'] ?? null, array_key_exists('effective_from', $vals), "$ptr/effective_from", true, $errors);
        $until = self::instant($vals['effective_until'] ?? null, array_key_exists('effective_until', $vals), "$ptr/effective_until", true, $errors);
        $interpretation = self::uuid($vals['interpretation_id'] ?? null, array_key_exists('interpretation_id', $vals), "$ptr/interpretation_id", true, $errors);
        $sourceRef = self::text($vals['source_condition_reference'] ?? null, array_key_exists('source_condition_reference', $vals), "$ptr/source_condition_reference", 200, true, $errors);

        if ($state === 'unrestricted') {
            if ($uses !== []) {
                $errors[] = self::field("$ptr/allowed_uses", 'invalid_format', 'Unrestricted lines must have empty allowed_uses.');
            }
            if ($events !== []) {
                $errors[] = self::field("$ptr/event_ids", 'invalid_format', 'Unrestricted lines must have empty event_ids.');
            }
            if ($units !== []) {
                $errors[] = self::field("$ptr/requesting_unit_ids", 'invalid_format', 'Unrestricted lines must have empty requesting_unit_ids.');
            }
            if ($from !== null) {
                $errors[] = self::field("$ptr/effective_from", 'invalid_format', 'Unrestricted lines must set effective_from to null.');
            }
            if ($until !== null) {
                $errors[] = self::field("$ptr/effective_until", 'invalid_format', 'Unrestricted lines must set effective_until to null.');
            }
            if ($interpretation !== null) {
                $errors[] = self::field("$ptr/interpretation_id", 'invalid_format', 'Unrestricted lines must set interpretation_id to null.');
            }
            if ($sourceRef !== null) {
                $errors[] = self::field("$ptr/source_condition_reference", 'invalid_format', 'Unrestricted lines must set source_condition_reference to null.');
            }
        } elseif ($state !== null) {
            if ($sourceRef === null) {
                $errors[] = self::field("$ptr/source_condition_reference", 'invalid_format', 'Restricted lines require a non-blank source_condition_reference.');
            }
            if ($from !== null && $until !== null
                && preg_match(OpeningDraftInput::UTC_INSTANT, $from)
                && preg_match(OpeningDraftInput::UTC_INSTANT, $until)
                && CarbonImmutable::parse($until, 'UTC')->lte(CarbonImmutable::parse($from, 'UTC'))) {
                $errors[] = self::field("$ptr/effective_until", 'invalid_format', 'effective_until must be after effective_from.');
            }
        }

        return [
            'state' => $state,
            'allowed_uses' => $uses,
            'event_ids' => $events,
            'requesting_unit_ids' => $units,
            'effective_from' => $from,
            'effective_until' => $until,
            'interpretation_id' => $interpretation,
            'source_condition_reference' => $sourceRef,
        ];
    }

    private static function evidence(mixed $raw, string $ptr, array &$errors): array
    {
        if (! $raw instanceof stdClass) {
            $errors[] = self::field($ptr, 'invalid_type', 'Signed paper evidence binding object is required.');

            return [];
        }
        $vals = self::objectKeys($raw, ['evidence_id', 'version_id', 'attachments'], $ptr, $errors);
        $attachments = [];
        if (array_key_exists('attachments', $vals)) {
            foreach (self::listOf($vals['attachments'], "$ptr/attachments", 1, 50, $errors) as $i => $item) {
                $itemPtr = "$ptr/attachments/{$i}";
                if (! $item instanceof stdClass) {
                    $errors[] = self::field($itemPtr, 'invalid_type', 'Attachment binding object is required.');

                    continue;
                }
                $itemVals = self::objectKeys($item, ['attachment_id', 'sha256'], $itemPtr, $errors);
                $attachments[] = [
                    'attachment_id' => self::uuid($itemVals['attachment_id'] ?? null, array_key_exists('attachment_id', $itemVals), "$itemPtr/attachment_id", false, $errors),
                    'sha256' => self::pattern($itemVals['sha256'] ?? null, array_key_exists('sha256', $itemVals), "$itemPtr/sha256", OpeningDraftInput::SHA256, false, $errors),
                ];
            }
        }

        return [
            'evidence_id' => self::uuid($vals['evidence_id'] ?? null, array_key_exists('evidence_id', $vals), "$ptr/evidence_id", false, $errors),
            'version_id' => self::uuid($vals['version_id'] ?? null, array_key_exists('version_id', $vals), "$ptr/version_id", false, $errors),
            'attachments' => $attachments,
        ];
    }

    private static function versions(array $vals, array &$errors): array
    {
        return [
            'expected_version' => self::intVal($vals['expected_version'] ?? null, array_key_exists('expected_version', $vals), '/expected_version', $errors),
            'expected_material_version' => self::intVal($vals['expected_material_version'] ?? null, array_key_exists('expected_material_version', $vals), '/expected_material_version', $errors),
        ];
    }

    private static function objectKeys(stdClass $obj, array $required, string $prefix, array &$errors): array
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

    private static function intVal(mixed $val, bool $present, string $ptr, array &$errors): int
    {
        if (! $present) {
            return 0;
        }
        if (! is_int($val)) {
            $errors[] = self::field($ptr, 'invalid_type', 'Integer required.');

            return 0;
        }
        if ($val < 1 || $val > 2147483647) {
            $errors[] = self::field($ptr, 'invalid_format', 'Integer must be between 1 and 2147483647.');
        }

        return $val;
    }

    private static function confirmTrue(mixed $val, bool $present, string $ptr, array &$errors): bool
    {
        if (! $present) {
            return false;
        }
        if (! is_bool($val)) {
            $errors[] = self::field($ptr, 'invalid_type', 'Boolean true is required.');

            return false;
        }
        if ($val !== true) {
            $errors[] = self::field($ptr, 'invalid_format', 'Confirm that the signed paper matches the record.');
        }

        return $val;
    }

    private static function text(mixed $val, bool $present, string $ptr, int $max, bool $nullable, array &$errors): ?string
    {
        $str = self::rawString($val, $present, $ptr, $nullable, $errors);
        if ($str === null) {
            return null;
        }
        if (! preg_match('/\S/u', $str)) {
            $errors[] = self::field($ptr, 'invalid_format', 'Non-blank string required.');
        } elseif (mb_strlen($str) > $max) {
            $errors[] = self::field($ptr, 'too_long', "Must not exceed {$max} characters.");
        }

        return $str;
    }

    private static function uuid(mixed $val, bool $present, string $ptr, bool $nullable, array &$errors): ?string
    {
        return self::pattern($val, $present, $ptr, AuthInput::UUID, $nullable, $errors);
    }

    private static function instant(mixed $val, bool $present, string $ptr, bool $nullable, array &$errors): ?string
    {
        $checked = self::pattern($val, $present, $ptr, OpeningDraftInput::UTC_INSTANT, $nullable, $errors);
        if ($checked !== null && preg_match(OpeningDraftInput::UTC_INSTANT, $checked)) {
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

    private static function pattern(mixed $val, bool $present, string $ptr, string $pattern, bool $nullable, array &$errors): ?string
    {
        $str = self::rawString($val, $present, $ptr, $nullable, $errors);
        if ($str !== null && ! preg_match($pattern, $str)) {
            $errors[] = self::field($ptr, 'invalid_format', 'Invalid value format.');
        }

        return $str;
    }

    /** @param list<string> $allowed */
    private static function enum(mixed $val, bool $present, string $ptr, array $allowed, array &$errors): ?string
    {
        $str = self::rawString($val, $present, $ptr, false, $errors);
        if ($str !== null && ! in_array($str, $allowed, true)) {
            $errors[] = self::field($ptr, 'invalid_format', 'Unsupported value.');
        }

        return $str;
    }

    private static function rawString(mixed $val, bool $present, string $ptr, bool $nullable, array &$errors): ?string
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

        return $val;
    }

    /** @return list<mixed> */
    private static function listOf(mixed $val, string $ptr, int $min, int $max, array &$errors): array
    {
        if (! is_array($val) || ! array_is_list($val)) {
            $errors[] = self::field($ptr, 'invalid_type', 'Array required.');

            return [];
        }
        if (count($val) < $min) {
            $errors[] = self::field($ptr, 'invalid_format', "At least {$min} item(s) required.");
        } elseif (count($val) > $max) {
            $errors[] = self::field($ptr, 'too_long', "Must not exceed {$max} items.");
        }

        return $val;
    }

    public static function field(string $pointer, string $code, string $message): array
    {
        return compact('pointer', 'code', 'message');
    }
}
