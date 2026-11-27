<?php

namespace App\Http\Requests;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use stdClass;

final class RepfInput
{
    public const TRIGGERS = ['rf_shortage', 'rop_replenishment'];

    public const STATUSES = [
        'draft', 'pending_budget_review', 'approved', 'held', 'returned_for_revision',
        'rejected', 'partially_ordered', 'ordered', 'canceled',
    ];

    public static function write(Request $request, string $operation): array
    {
        return OpeningDraftInput::parseWrite($request, static function (stdClass $raw, array &$errors) use ($operation): array {
            $text = ['string', 'regex:/\S/u'];
            $uuid = ['string', 'regex:'.AuthInput::UUID];
            $version = ['required', 'integer:strict', 'between:1,2147483647'];
            $rules = $operation === 'createRepf' ? [] : [
                'expected_version' => $version,
                'expected_material_version' => $version,
            ];

            if (in_array($operation, ['createRepf', 'replaceRepf'], true)) {
                $lineKeys = [
                    'trigger_kind', 'variant_id', 'unit_id', 'rf_id', 'rf_line_id', 'requested_quantity',
                    'estimated_unit_cost_php', 'needed_by', 'additional_purchase_reason', 'notes',
                ];
                $rules += [
                    'funding_source' => ['required', 'string', Rule::in(['chapter_funds'])],
                    'urgency' => ['required', 'string', Rule::in(['normal', 'urgent', 'critical'])],
                    'justification' => ['required', ...$text, 'max:1000'],
                    'lines' => ['required', 'array', 'list', 'min:1', 'max:100'],
                    'lines.*' => ['required', 'array:'.implode(',', $lineKeys)],
                    'lines.*.trigger_kind' => ['required', 'string', Rule::in(self::TRIGGERS)],
                    'lines.*.variant_id' => ['required', ...$uuid],
                    'lines.*.unit_id' => ['required', ...$uuid],
                    'lines.*.rf_id' => ['present', 'nullable', ...$uuid],
                    'lines.*.rf_line_id' => ['present', 'nullable', ...$uuid],
                    'lines.*.requested_quantity' => ['required', 'string', 'regex:'.OpeningDraftInput::STOCK_QTY, 'not_regex:/\A0(?:\.0+)?\z/'],
                    'lines.*.estimated_unit_cost_php' => ['required', 'string', 'regex:'.OpeningDraftInput::PHP_MONEY],
                    'lines.*.needed_by' => ['present', 'nullable', 'string', 'regex:'.OpeningDraftInput::UTC_INSTANT, 'date_format:Y-m-d\TH:i:s.u\Z'],
                    'lines.*.additional_purchase_reason' => ['present', 'nullable', 'array:category,referenced_source_ids,explanation'],
                    'lines.*.notes' => ['present', 'nullable', ...$text, 'max:500'],
                ];
                if (isset($raw->lines) && ! is_array($raw->lines)) {
                    $errors[] = self::field('/lines', 'An array of line objects is required.');
                }

                $seen = [];
                foreach (is_array($raw->lines ?? null) ? array_slice($raw->lines, 0, 100) : [] as $i => $line) {
                    if (! $line instanceof stdClass) {
                        $errors[] = self::field("/lines/$i", 'A line object is required.');

                        continue;
                    }
                    $trigger = $line->trigger_kind ?? null;
                    $rf = $trigger === 'rf_shortage';
                    $rop = $trigger === 'rop_replenishment';
                    foreach (['rf_id', 'rf_line_id'] as $link) {
                        if (($rf && ($line->$link ?? null) === null) || ($rop && ($line->$link ?? null) !== null)) {
                            $errors[] = self::field("/lines/$i/$link", 'RF linkage must match the trigger.');
                        }
                    }
                    $uniqueId = $rf ? ($line->rf_line_id ?? null) : ($line->variant_id ?? null);
                    if (($rf || $rop) && is_string($uniqueId)) {
                        if (isset($seen[$trigger][$uniqueId])) {
                            $errors[] = self::field("/lines/$i/".($rf ? 'rf_line_id' : 'variant_id'), 'This source is already included.');
                        }
                        $seen[$trigger][$uniqueId] = true;
                    }

                    if (is_string($line->notes ?? null) && ! preg_match('/\S/u', $line->notes)) {
                        $errors[] = self::field("/lines/$i/notes", 'Use null or non-blank notes.');
                    }
                    $reason = $line->additional_purchase_reason ?? null;
                    if ($reason !== null) {
                        if (! $reason instanceof stdClass || ! is_array($reason->referenced_source_ids ?? null)) {
                            $errors[] = self::field("/lines/$i/additional_purchase_reason", 'A reason object with a referenced source list is required.');
                        }
                        $prefix = "lines.$i.additional_purchase_reason";
                        $rules += [
                            "$prefix.category" => ['required', 'string', Rule::in(['late_supply', 'disputed_supply', 'ineligible_supply'])],
                            "$prefix.referenced_source_ids" => ['present', 'array', 'list', 'max:50'],
                            "$prefix.referenced_source_ids.*" => ['required', ...$uuid, 'distinct:strict'],
                            "$prefix.explanation" => ['required', ...$text, 'max:500'],
                        ];
                    }
                }
            }

            if ($operation === 'reviewRepfBudget') {
                $rules['decision'] = ['required', 'string', Rule::in(['approve', 'hold', 'return', 'reject'])];
            }
            if (in_array($operation, ['reviewRepfBudget', 'resumeRepfReview', 'reviseRepf', 'cancelRepf'], true)) {
                $required = $operation === 'cancelRepf'
                    || ($operation === 'reviewRepfBudget' && ($raw->decision ?? null) !== 'approve');
                if (! $required && is_string($raw->reason ?? null) && ! preg_match('/\S/u', $raw->reason)) {
                    $errors[] = self::field('/reason', 'Use null or a non-blank reason.');
                }
                $rules['reason'] = [$required ? 'required' : 'present', ...($required ? [] : ['nullable']), ...$text, 'max:500'];
            }

            $payload = json_decode(json_encode($raw, JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR);
            foreach (array_diff(array_keys($payload), array_keys($rules)) as $key) {
                $errors[] = self::field('/'.str_replace(['~', '/'], ['~0', '~1'], $key), 'This field is not accepted.');
            }

            $validator = Validator::make($payload, $rules);
            foreach ($validator->errors()->messages() as $field => $messages) {
                $errors[] = self::field('/'.str_replace('.', '/', $field), $messages[0]);
            }

            return $payload;
        });
    }

    public static function field(string $pointer, string $message): array
    {
        return ['pointer' => $pointer, 'code' => 'invalid_value', 'message' => $message];
    }
}
