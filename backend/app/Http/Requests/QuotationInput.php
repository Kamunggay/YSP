<?php

namespace App\Http\Requests;

use App\Exceptions\ContractException;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use stdClass;

final class QuotationInput
{
    public const SUBTYPES = [
        'local_retailer', 'wholesaler', 'manufacturer', 'distributor', 'cooperative', 'service_provider', 'other',
    ];

    public const ISO_DATE = '/\A\d{4}-\d{2}-\d{2}\z/';

    /** @return array{string, array<string, mixed>} */
    public static function write(Request $request, string $operation): array
    {
        if ($operation === 'deleteRepfQuotation') {
            return self::parseDelete($request);
        }

        try {
            return OpeningDraftInput::parseWrite($request, static function (stdClass $raw, array &$errors) use ($operation): array {
                $text = ['string', 'regex:/\S/u'];
                $uuid = ['string', 'regex:'.AuthInput::UUID];
                $version = ['required', 'integer:strict', 'between:1,2147483647'];

                if ($operation === 'recordSupplierSelection') {
                    $rules = [
                        'expected_repf_version' => $version,
                        'expected_repf_material_version' => $version,
                        'selected_quotation_id' => ['required', ...$uuid],
                        'comparable_quotation_ids' => ['required', 'array', 'list', 'min:1', 'max:50'],
                        'comparable_quotation_ids.*' => ['required', ...$uuid, 'distinct:strict'],
                        'selection_rationale' => ['required', ...$text, 'max:1000'],
                        'emergency_waiver' => ['present', 'nullable', 'array:reason'],
                    ];
                    self::rejectBlankNullable($raw, ['emergency_waiver'], '', $errors);
                    if (isset($raw->comparable_quotation_ids) && ! is_array($raw->comparable_quotation_ids)) {
                        $errors[] = RepfInput::field('/comparable_quotation_ids', 'An array of quotation UUIDs is required.', 'invalid_type');
                    }
                    if (isset($raw->emergency_waiver) && $raw->emergency_waiver !== null) {
                        if (! $raw->emergency_waiver instanceof stdClass) {
                            $errors[] = RepfInput::field('/emergency_waiver', 'An emergency waiver object is required.', 'invalid_type');
                        }
                        $rules['emergency_waiver.reason'] = ['required', ...$text, 'max:500'];
                    }
                    if (is_array($raw->comparable_quotation_ids ?? null) && is_string($raw->selected_quotation_id ?? null)
                        && ! in_array($raw->selected_quotation_id, $raw->comparable_quotation_ids, true)) {
                        $errors[] = RepfInput::field('/comparable_quotation_ids', 'Selected quotation must be included in comparable_quotation_ids.');
                    }

                    return self::finishValidation($raw, $rules, $errors);
                }

                $rules = $operation === 'replaceRepfQuotation' ? [
                    'expected_version' => $version,
                    'expected_material_version' => $version,
                ] : [];
                $rules += [
                    'supplier' => ['required', 'array:supplier_name,supplier_subtype,contact_reference,supplier_reference'],
                    'supplier.supplier_name' => ['required', ...$text, 'max:200'],
                    'supplier.supplier_subtype' => ['required', 'string', Rule::in(self::SUBTYPES)],
                    'supplier.contact_reference' => ['required', ...$text, 'max:200'],
                    'supplier.supplier_reference' => ['present', 'nullable', ...$text, 'max:120'],
                    'quoted_at' => ['required', 'string', 'regex:'.OpeningDraftInput::UTC_INSTANT],
                    'valid_until' => ['present', 'nullable', 'string', 'regex:'.self::ISO_DATE],
                    'lead_time_days' => ['required', 'integer:strict', 'between:0,3650'],
                    'availability_summary' => ['required', ...$text, 'max:500'],
                    'quality_warranty_terms' => ['required', ...$text, 'max:1000'],
                    'payment_and_delivery_terms' => ['required', ...$text, 'max:1000'],
                    'reliability_notes' => ['present', 'nullable', ...$text, 'max:500'],
                    'evidence' => ['present', 'nullable', 'array:evidence_id,version_id,attachments'],
                    'lines' => ['required', 'array', 'list', 'min:1', 'max:100'],
                    'lines.*' => ['required', 'array:repf_line_id,variant_id,unit_id,quoted_quantity,unit_price_php,notes'],
                    'lines.*.repf_line_id' => ['required', ...$uuid],
                    'lines.*.variant_id' => ['required', ...$uuid],
                    'lines.*.unit_id' => ['required', ...$uuid],
                    'lines.*.quoted_quantity' => ['required', 'string', 'regex:'.OpeningDraftInput::STOCK_QTY, 'not_regex:/\A0(?:\.0+)?\z/'],
                    'lines.*.unit_price_php' => ['required', 'string', 'regex:'.OpeningDraftInput::PHP_MONEY],
                    'lines.*.notes' => ['present', 'nullable', ...$text, 'max:500'],
                ];

                self::rejectBlankNullable($raw, ['valid_until', 'reliability_notes', 'evidence'], '', $errors);
                if (isset($raw->supplier) && $raw->supplier instanceof stdClass) {
                    self::rejectBlankNullable($raw->supplier, ['supplier_reference'], '/supplier', $errors);
                } elseif (isset($raw->supplier)) {
                    $errors[] = RepfInput::field('/supplier', 'A supplier object is required.', 'invalid_type');
                }
                self::checkUtcInstant($raw->quoted_at ?? null, '/quoted_at', $errors);
                self::checkIsoDate($raw->valid_until ?? null, '/valid_until', $errors);
                self::checkEvidenceBinding($raw->evidence ?? null, '/evidence', $rules, $errors);

                if (isset($raw->lines) && ! is_array($raw->lines)) {
                    $errors[] = RepfInput::field('/lines', 'An array of line objects is required.', 'invalid_type');
                }
                foreach (is_array($raw->lines ?? null) ? array_slice($raw->lines, 0, 100) : [] as $i => $line) {
                    if (! $line instanceof stdClass) {
                        $errors[] = RepfInput::field("/lines/$i", 'A line object is required.', 'invalid_type');

                        continue;
                    }
                    self::rejectBlankNullable($line, ['notes'], "/lines/$i", $errors);
                }

                return self::finishValidation($raw, $rules, $errors);
            });
        } catch (ContractException $exception) {
            if ($exception->errorCode === 'malformed_request') {
                throw new ContractException(400, 'invalid_selector', $exception->getMessage());
            }
            throw $exception;
        }
    }

    /** @return array{string, array<string, mixed>} */
    private static function parseDelete(Request $request): array
    {
        if ($request->getContent() !== '') {
            throw new ContractException(400, 'invalid_selector', 'DELETE quotation accepts no request body.');
        }
        $keys = $request->headers->all('X-Action-Key');
        if (count($keys) !== 1 || ! preg_match(AuthInput::UUID, (string) $keys[0])) {
            throw new ContractException(400, 'invalid_selector', 'Supply a valid X-Action-Key UUID header.');
        }
        $query = (string) $request->server('QUERY_STRING', '');
        if (preg_match('/%(?![0-9a-f]{2})/i', $query)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid query selector encoding.');
        }
        $selectors = [];
        foreach ($query === '' ? [] : explode('&', $query) as $part) {
            [$rawKey, $rawVal] = array_pad(explode('=', $part, 2), 2, '');
            $key = urldecode($rawKey);
            if ($rawKey !== $key || ! in_array($key, ['expected_version', 'expected_material_version'], true)
                || isset($selectors[$key]) || $rawVal === '') {
                throw new ContractException(400, 'invalid_selector', 'Invalid query selector.');
            }
            $selectors[$key] = urldecode($rawVal);
        }
        if (! isset($selectors['expected_version'], $selectors['expected_material_version'])) {
            throw new ContractException(400, 'invalid_selector', 'expected_version and expected_material_version are required.');
        }

        return [(string) $keys[0], [
            'expected_version' => OpeningDraftInput::requireRevision($selectors['expected_version']),
            'expected_material_version' => OpeningDraftInput::requireRevision($selectors['expected_material_version']),
        ]];
    }

    public static function rejectBlankNullable(stdClass $obj, array $fields, string $prefix, array &$errors): void
    {
        foreach ($fields as $field) {
            if (property_exists($obj, $field) && is_string($obj->$field) && ! preg_match('/\S/u', $obj->$field)) {
                $errors[] = RepfInput::field("$prefix/$field", 'Use null or a non-blank value of the expected type.');
            }
        }
    }

    public static function checkUtcInstant(mixed $val, string $pointer, array &$errors): void
    {
        if (! is_string($val) || ! preg_match(OpeningDraftInput::UTC_INSTANT, $val)) {
            return;
        }
        try {
            $parsed = CarbonImmutable::createFromFormat('Y-m-d\TH:i:s.u\Z', $val, 'UTC');
            if (! $parsed || $parsed->format('Y-m-d\TH:i:s.u\Z') !== $val) {
                $errors[] = RepfInput::field($pointer, 'Valid UTC timestamp required.');
            }
        } catch (\Throwable) {
            $errors[] = RepfInput::field($pointer, 'Valid UTC timestamp required.');
        }
    }

    public static function checkIsoDate(mixed $val, string $pointer, array &$errors): void
    {
        if (! is_string($val) || ! preg_match(self::ISO_DATE, $val)) {
            return;
        }
        try {
            $parsed = CarbonImmutable::createFromFormat('!Y-m-d', $val, 'UTC');
            if (! $parsed || $parsed->format('Y-m-d') !== $val) {
                $errors[] = RepfInput::field($pointer, 'Valid calendar ISO date required.');
            }
        } catch (\Throwable) {
            $errors[] = RepfInput::field($pointer, 'Valid calendar ISO date required.');
        }
    }

    public static function checkEvidenceBinding(mixed $val, string $pointer, array &$rules, array &$errors): void
    {
        if ($val === null) {
            return;
        }
        $key = ltrim(str_replace('/', '.', $pointer), '.');
        if (! $val instanceof stdClass) {
            $errors[] = RepfInput::field($pointer, 'An evidence binding object is required.', 'invalid_type');

            return;
        }
        if (isset($val->attachments) && ! is_array($val->attachments)) {
            $errors[] = RepfInput::field("$pointer/attachments", 'An array of attachment objects is required.', 'invalid_type');
        }
        $uuid = ['required', 'string', 'regex:'.AuthInput::UUID];
        $rules += [
            "$key.evidence_id" => $uuid,
            "$key.version_id" => $uuid,
            "$key.attachments" => ['required', 'array', 'list', 'min:1'],
            "$key.attachments.*" => ['required', 'array:attachment_id,sha256'],
            "$key.attachments.*.attachment_id" => $uuid,
            "$key.attachments.*.sha256" => ['required', 'string', 'regex:'.OpeningDraftInput::SHA256],
        ];
    }

    public static function finishValidation(stdClass $raw, array $rules, array &$errors): array
    {
        $payload = json_decode(json_encode($raw, JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR);
        $topAllowed = array_filter(array_keys($rules), fn (string $key) => ! str_contains($key, '.'));
        foreach (array_diff(array_keys($payload), $topAllowed) as $key) {
            $errors[] = RepfInput::field('/'.str_replace(['~', '/'], ['~0', '~1'], $key), 'This field is not accepted.', 'unexpected_field');
        }

        $validator = Validator::make($payload, $rules);
        foreach ($validator->errors()->messages() as $field => $messages) {
            $rule = array_key_first($validator->failed()[$field]);
            $code = match ($rule) {
                'Required', 'Present' => 'required',
                'String', 'Integer', 'Array', 'List', 'Boolean' => 'invalid_type',
                'Max' => 'too_long',
                default => 'invalid_format',
            };
            $errors[] = RepfInput::field('/'.str_replace('.', '/', $field), $messages[0], $code);
        }

        return $payload;
    }
}
