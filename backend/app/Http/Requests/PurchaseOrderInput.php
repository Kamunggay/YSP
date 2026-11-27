<?php

namespace App\Http\Requests;

use App\Exceptions\ContractException;
use Illuminate\Http\Request;
use stdClass;

final class PurchaseOrderInput
{
    public const STATUSES = [
        'draft', 'pending_approval', 'returned_for_revision', 'rejected',
        'issued', 'partially_received', 'receiving_complete', 'closed_short', 'canceled',
    ];

    /** @return array{string, array<string, mixed>} */
    public static function write(Request $request, string $operation): array
    {
        try {
            return OpeningDraftInput::parseWrite($request, static function (stdClass $raw, array &$errors) use ($operation): array {
                $text = ['string', 'regex:/\S/u'];
                $uuid = ['string', 'regex:'.AuthInput::UUID];
                $version = ['required', 'integer:strict', 'between:1,2147483647'];

                $rules = $operation === 'createPurchaseOrder' ? [] : [
                    'expected_version' => $version,
                    'expected_material_version' => $version,
                ];

                if (in_array($operation, ['createPurchaseOrder', 'replacePurchaseOrder', 'proposePurchaseOrderAmendment'], true)) {
                    $isCreate = $operation === 'createPurchaseOrder';
                    $isAmend = $operation === 'proposePurchaseOrderAmendment';
                    if ($isCreate) {
                        $rules += [
                            'repf_id' => ['required', ...$uuid],
                            'supplier_selection_id' => ['required', ...$uuid],
                        ];
                    }
                    $rules += [
                        'delivery_location' => ['required', ...$text, 'max:300'],
                        'expected_delivery_date' => ['required', 'string', 'regex:'.QuotationInput::ISO_DATE],
                        'payment_and_delivery_terms' => ['required', ...$text, 'max:1000'],
                    ];
                    if ($isAmend) {
                        $rules['reason'] = ['required', ...$text, 'max:500'];
                    }

                    $lineKeys = $isAmend
                        ? 'po_line_id,repf_line_id,variant_id,unit_id,ordered_quantity,unit_price_php,specifications,notes'
                        : 'repf_line_id,quotation_line_id,variant_id,unit_id,ordered_quantity,unit_price_php,specifications,notes';
                    $rules += [
                        'lines' => ['required', 'array', 'list', 'min:1', 'max:100'],
                        'lines.*' => ['required', 'array:'.$lineKeys],
                        'lines.*.repf_line_id' => ['required', ...$uuid],
                        'lines.*.variant_id' => ['required', ...$uuid],
                        'lines.*.unit_id' => ['required', ...$uuid],
                        'lines.*.ordered_quantity' => ['required', 'string', 'regex:'.OpeningDraftInput::STOCK_QTY, 'not_regex:/\A0(?:\.0+)?\z/'],
                        'lines.*.unit_price_php' => ['required', 'string', 'regex:'.OpeningDraftInput::PHP_MONEY],
                        'lines.*.specifications' => ['required', ...$text, 'max:500'],
                        'lines.*.notes' => ['present', 'nullable', ...$text, 'max:500'],
                    ];
                    if ($isAmend) {
                        $rules['lines.*.po_line_id'] = ['present', 'nullable', ...$uuid];
                    } else {
                        $rules['lines.*.quotation_line_id'] = ['required', ...$uuid];
                    }

                    QuotationInput::checkIsoDate($raw->expected_delivery_date ?? null, '/expected_delivery_date', $errors);
                    if (isset($raw->lines) && ! is_array($raw->lines)) {
                        $errors[] = RepfInput::field('/lines', 'An array of line objects is required.', 'invalid_type');
                    }
                    foreach (is_array($raw->lines ?? null) ? array_slice($raw->lines, 0, 100) : [] as $i => $line) {
                        if (! $line instanceof stdClass) {
                            $errors[] = RepfInput::field("/lines/$i", 'A line object is required.', 'invalid_type');

                            continue;
                        }
                        $nullable = $isAmend ? ['po_line_id', 'notes'] : ['notes'];
                        QuotationInput::rejectBlankNullable($line, $nullable, "/lines/$i", $errors);
                    }
                } elseif (in_array($operation, ['approvePurchaseOrder', 'approvePurchaseOrderAmendment'], true)) {
                    $rules['approval_notes'] = ['present', 'nullable', ...$text, 'max:500'];
                    QuotationInput::rejectBlankNullable($raw, ['approval_notes'], '', $errors);
                } elseif (in_array($operation, ['returnPurchaseOrder', 'rejectPurchaseOrder', 'closeShortPurchaseOrder', 'cancelPurchaseOrder'], true)) {
                    $rules['reason'] = ['required', ...$text, 'max:500'];
                } elseif ($operation === 'recordPurchaseOrderAcknowledgment') {
                    $rules += [
                        'supplier_confirmation_reference' => ['present', 'nullable', ...$text, 'max:120'],
                        'acknowledged_at' => ['required', 'string', 'regex:'.OpeningDraftInput::UTC_INSTANT],
                        'revised_expected_delivery_date' => ['present', 'nullable', 'string', 'regex:'.QuotationInput::ISO_DATE],
                        'notes' => ['present', 'nullable', ...$text, 'max:500'],
                        'evidence' => ['present', 'nullable', 'array:evidence_id,version_id,attachments'],
                    ];
                    QuotationInput::rejectBlankNullable($raw, ['supplier_confirmation_reference', 'revised_expected_delivery_date', 'notes', 'evidence'], '', $errors);
                    QuotationInput::checkUtcInstant($raw->acknowledged_at ?? null, '/acknowledged_at', $errors);
                    QuotationInput::checkIsoDate($raw->revised_expected_delivery_date ?? null, '/revised_expected_delivery_date', $errors);
                    QuotationInput::checkEvidenceBinding($raw->evidence ?? null, '/evidence', $rules, $errors);
                }

                return QuotationInput::finishValidation($raw, $rules, $errors);
            });
        } catch (ContractException $exception) {
            if ($exception->errorCode === 'malformed_request') {
                throw new ContractException(400, 'invalid_selector', $exception->getMessage());
            }
            throw $exception;
        }
    }
}
