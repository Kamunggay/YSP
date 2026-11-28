<?php

namespace App\Http\Requests;

use App\Exceptions\ContractException;
use Brick\Math\BigDecimal;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use stdClass;

final class ReceivingInput
{
    public const SOURCE_KINDS = ['po', 'da'];

    public const REPORT_STATUSES = ['draft', 'inspected', 'evidence_matched', 'posted', 'canceled'];

    public const REPORT_ELIGIBLE_FOR = ['discrepancy_replacement'];

    public const DISCREPANCY_STATUSES = ['open', 'supplier_notified', 'under_review', 'resolved'];

    public const DISCREPANCY_ELIGIBLE_FOR = ['supplier_notification', 'resolution'];

    public const RESOLUTION_KINDS = [
        'supplier_replacement_received',
        'returned_to_supplier',
        'credit_or_short_closed',
        'donated_declined_or_disposed',
    ];

    public const QUARANTINED_DISPOSITIONS = [
        'retained_in_quarantine',
        'returned_to_supplier_physically',
        'disposed_per_policy',
    ];

    public const HOLD_STATUSES = ['held', 'linked_to_source', 'rejected_returned'];

    public const HOLD_ELIGIBLE_FOR = ['source_link', 'receiving_draft'];

    public const SENDER_KINDS = ['supplier', 'donor', 'carrier', 'unknown'];

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
                'createReceivingReport' => self::validateCreateReport($raw, $errors),
                'replaceReceivingReport' => self::validateReplaceReport($raw, $errors),
                'inspectReceivingReport' => self::validateInspectReport($raw, $errors),
                'matchReceivingReportEvidence' => self::validateMatchEvidence($raw, $errors),
                'postReceivingReport' => self::validatePostReport($raw, $errors),
                'cancelReceivingReport' => self::validateCancelReport($raw, $errors),
                'notifySupplierOfReceivingDiscrepancy' => self::validateNotifySupplier($raw, $errors),
                'resolveReceivingDiscrepancy' => self::validateResolveDiscrepancy($raw, $errors),
                'createReceivingHold' => self::validateCreateHold($raw, $errors),
                'linkReceivingHoldSource' => self::validateLinkHoldSource($raw, $errors),
                'rejectReturnReceivingHold' => self::validateRejectReturnHold($raw, $errors),
                default => throw new ContractException(400, 'malformed_request', 'Unsupported receiving operation.'),
            };
        });
    }

    private static function validateCreateReport(stdClass $raw, array &$errors): array
    {
        $required = [
            'source_kind', 'source_id', 'source_material_version', 'originating_hold_id',
            'supplier_dr_reference', 'supplier_dr_date', 'location_id', 'lines',
        ];
        $vals = self::objectKeys($raw, $required, '', $errors);
        $sourceKind = self::enum($vals['source_kind'] ?? null, array_key_exists('source_kind', $vals), '/source_kind', self::SOURCE_KINDS, $errors);
        $drRef = self::text($vals['supplier_dr_reference'] ?? null, array_key_exists('supplier_dr_reference', $vals), '/supplier_dr_reference', 80, true, $errors);
        $drDate = self::isoDate($vals['supplier_dr_date'] ?? null, array_key_exists('supplier_dr_date', $vals), '/supplier_dr_date', true, $errors);

        self::enforceDrPairForSourceKind($sourceKind, $drRef, $drDate, $errors);

        return [
            'source_kind' => $sourceKind,
            'source_id' => self::uuid($vals['source_id'] ?? null, array_key_exists('source_id', $vals), '/source_id', false, $errors),
            'source_material_version' => self::intVal($vals['source_material_version'] ?? null, array_key_exists('source_material_version', $vals), '/source_material_version', $errors),
            'originating_hold_id' => self::uuid($vals['originating_hold_id'] ?? null, array_key_exists('originating_hold_id', $vals), '/originating_hold_id', true, $errors),
            'supplier_dr_reference' => $drRef,
            'supplier_dr_date' => $drDate,
            'location_id' => self::uuid($vals['location_id'] ?? null, array_key_exists('location_id', $vals), '/location_id', false, $errors),
            'lines' => self::validateReportLines($vals, $sourceKind, $errors),
        ];
    }

    private static function validateReplaceReport(stdClass $raw, array &$errors): array
    {
        $required = [
            'expected_version', 'expected_material_version', 'source_material_version',
            'supplier_dr_reference', 'supplier_dr_date', 'location_id', 'lines',
        ];
        $vals = self::objectKeys($raw, $required, '', $errors);
        $drRef = self::text($vals['supplier_dr_reference'] ?? null, array_key_exists('supplier_dr_reference', $vals), '/supplier_dr_reference', 80, true, $errors);
        $drDate = self::isoDate($vals['supplier_dr_date'] ?? null, array_key_exists('supplier_dr_date', $vals), '/supplier_dr_date', true, $errors);

        if ($drRef === null && $drDate !== null) {
            $errors[] = self::field('/supplier_dr_date', 'invalid_format', 'supplier_dr_date must be null when supplier_dr_reference is null.');
        } elseif ($drRef !== null && $drDate === null && array_key_exists('supplier_dr_date', $vals)) {
            $errors[] = self::field('/supplier_dr_date', 'invalid_format', 'supplier_dr_date is required when supplier_dr_reference is provided.');
        }

        return self::versions($vals, $errors) + [
            'source_material_version' => self::intVal($vals['source_material_version'] ?? null, array_key_exists('source_material_version', $vals), '/source_material_version', $errors),
            'supplier_dr_reference' => $drRef,
            'supplier_dr_date' => $drDate,
            'location_id' => self::uuid($vals['location_id'] ?? null, array_key_exists('location_id', $vals), '/location_id', false, $errors),
            'lines' => self::validateReportLines($vals, null, $errors),
        ];
    }

    private static function validateInspectReport(stdClass $raw, array &$errors): array
    {
        $required = [
            'expected_version', 'expected_material_version', 'source_material_version',
            'technical_or_requesting_representative_id', 'inspected_at', 'inspection_notes', 'lines',
        ];
        $vals = self::objectKeys($raw, $required, '', $errors);

        return self::versions($vals, $errors) + [
            'source_material_version' => self::intVal($vals['source_material_version'] ?? null, array_key_exists('source_material_version', $vals), '/source_material_version', $errors),
            'technical_or_requesting_representative_id' => self::uuid($vals['technical_or_requesting_representative_id'] ?? null, array_key_exists('technical_or_requesting_representative_id', $vals), '/technical_or_requesting_representative_id', true, $errors),
            'inspected_at' => self::instant($vals['inspected_at'] ?? null, array_key_exists('inspected_at', $vals), '/inspected_at', false, $errors),
            'inspection_notes' => self::text($vals['inspection_notes'] ?? null, array_key_exists('inspection_notes', $vals), '/inspection_notes', 500, false, $errors),
            'lines' => self::validateReportLines($vals, null, $errors),
        ];
    }

    private static function validateMatchEvidence(stdClass $raw, array &$errors): array
    {
        $vals = self::objectKeys($raw, ['expected_version', 'expected_material_version', 'snapshot_sha256', 'evidence', 'acknowledged_at'], '', $errors);

        return self::versions($vals, $errors) + [
            'snapshot_sha256' => self::pattern($vals['snapshot_sha256'] ?? null, array_key_exists('snapshot_sha256', $vals), '/snapshot_sha256', OpeningDraftInput::SHA256, false, $errors),
            'evidence' => array_key_exists('evidence', $vals) ? self::evidence($vals['evidence'], '/evidence', $errors) : [],
            'acknowledged_at' => self::instant($vals['acknowledged_at'] ?? null, array_key_exists('acknowledged_at', $vals), '/acknowledged_at', false, $errors),
        ];
    }

    private static function validatePostReport(stdClass $raw, array &$errors): array
    {
        $vals = self::objectKeys($raw, ['expected_version', 'expected_material_version', 'source_material_version', 'acknowledgment_id'], '', $errors);

        return self::versions($vals, $errors) + [
            'source_material_version' => self::intVal($vals['source_material_version'] ?? null, array_key_exists('source_material_version', $vals), '/source_material_version', $errors),
            'acknowledgment_id' => self::uuid($vals['acknowledgment_id'] ?? null, array_key_exists('acknowledgment_id', $vals), '/acknowledgment_id', false, $errors),
        ];
    }

    private static function validateCancelReport(stdClass $raw, array &$errors): array
    {
        $vals = self::objectKeys($raw, ['expected_version', 'expected_material_version', 'reason'], '', $errors);

        return self::versions($vals, $errors) + [
            'reason' => self::text($vals['reason'] ?? null, array_key_exists('reason', $vals), '/reason', 500, false, $errors),
        ];
    }

    private static function validateNotifySupplier(stdClass $raw, array &$errors): array
    {
        $vals = self::objectKeys($raw, [
            'expected_version', 'expected_material_version', 'supplier_contact_reference',
            'notification_notes', 'expected_resolution_date',
        ], '', $errors);

        return self::versions($vals, $errors) + [
            'supplier_contact_reference' => self::text($vals['supplier_contact_reference'] ?? null, array_key_exists('supplier_contact_reference', $vals), '/supplier_contact_reference', 200, false, $errors),
            'notification_notes' => self::text($vals['notification_notes'] ?? null, array_key_exists('notification_notes', $vals), '/notification_notes', 500, false, $errors),
            'expected_resolution_date' => self::isoDate($vals['expected_resolution_date'] ?? null, array_key_exists('expected_resolution_date', $vals), '/expected_resolution_date', true, $errors),
        ];
    }

    private static function validateResolveDiscrepancy(stdClass $raw, array &$errors): array
    {
        $vars = get_object_vars($raw);
        $action = self::enum($vars['action'] ?? null, array_key_exists('action', $vars), '/action', ['start_review', 'resolve'], $errors);
        if ($action === 'start_review') {
            $vals = self::objectKeys($raw, ['action', 'expected_version', 'expected_material_version', 'review_notes'], '', $errors);

            return ['action' => 'start_review'] + self::versions($vals, $errors) + [
                'review_notes' => self::text($vals['review_notes'] ?? null, array_key_exists('review_notes', $vals), '/review_notes', 500, false, $errors),
            ];
        }
        if ($action === 'resolve') {
            $required = [
                'action', 'expected_version', 'expected_material_version', 'resolution_kind',
                'reason', 'replacement_rm_id', 'quarantined_lot_disposition', 'evidence', 'signed_at',
            ];
            $vals = self::objectKeys($raw, $required, '', $errors);
            $kind = self::enum($vals['resolution_kind'] ?? null, array_key_exists('resolution_kind', $vals), '/resolution_kind', self::RESOLUTION_KINDS, $errors);
            $replacementRmId = self::uuid($vals['replacement_rm_id'] ?? null, array_key_exists('replacement_rm_id', $vals), '/replacement_rm_id', true, $errors);

            if ($kind === 'supplier_replacement_received' && $replacementRmId === null && array_key_exists('replacement_rm_id', $vals)) {
                $errors[] = self::field('/replacement_rm_id', 'invalid_format', 'replacement_rm_id is required when resolution_kind is supplier_replacement_received.');
            } elseif ($kind !== null && $kind !== 'supplier_replacement_received' && $replacementRmId !== null) {
                $errors[] = self::field('/replacement_rm_id', 'invalid_format', 'replacement_rm_id must be null unless resolution_kind is supplier_replacement_received.');
            }

            return ['action' => 'resolve'] + self::versions($vals, $errors) + [
                'resolution_kind' => $kind,
                'reason' => self::text($vals['reason'] ?? null, array_key_exists('reason', $vals), '/reason', 500, false, $errors),
                'replacement_rm_id' => $replacementRmId,
                'quarantined_lot_disposition' => self::enum($vals['quarantined_lot_disposition'] ?? null, array_key_exists('quarantined_lot_disposition', $vals), '/quarantined_lot_disposition', self::QUARANTINED_DISPOSITIONS, $errors),
                'evidence' => array_key_exists('evidence', $vals) ? self::evidence($vals['evidence'], '/evidence', $errors) : [],
                'signed_at' => self::instant($vals['signed_at'] ?? null, array_key_exists('signed_at', $vals), '/signed_at', false, $errors),
            ];
        }

        return [];
    }

    private static function validateCreateHold(stdClass $raw, array &$errors): array
    {
        $required = [
            'arrived_at', 'holding_location_id', 'carrier_or_sender_name', 'sender_kind',
            'delivery_document_reference', 'hold_reason', 'items', 'intake_evidence',
        ];
        $vals = self::objectKeys($raw, $required, '', $errors);
        $items = [];
        if (array_key_exists('items', $vals)) {
            foreach (self::listOf($vals['items'], '/items', 1, 100, $errors) as $i => $item) {
                $ptr = "/items/{$i}";
                if (! $item instanceof stdClass) {
                    $errors[] = self::field($ptr, 'invalid_type', 'Hold item object is required.');

                    continue;
                }
                $itemVals = self::objectKeys($item, ['variant_id', 'unit_id', 'item_description', 'arrived_quantity', 'condition_notes'], $ptr, $errors);
                $qty = self::pattern($itemVals['arrived_quantity'] ?? null, array_key_exists('arrived_quantity', $itemVals), "$ptr/arrived_quantity", OpeningDraftInput::STOCK_QTY, false, $errors);
                if ($qty !== null && preg_match('/\A0(?:\.0+)?\z/', $qty)) {
                    $errors[] = self::field("$ptr/arrived_quantity", 'invalid_format', 'Arrived quantity must be greater than zero.');
                }
                $items[] = [
                    'variant_id' => self::uuid($itemVals['variant_id'] ?? null, array_key_exists('variant_id', $itemVals), "$ptr/variant_id", true, $errors),
                    'unit_id' => self::uuid($itemVals['unit_id'] ?? null, array_key_exists('unit_id', $itemVals), "$ptr/unit_id", true, $errors),
                    'item_description' => self::text($itemVals['item_description'] ?? null, array_key_exists('item_description', $itemVals), "$ptr/item_description", 200, false, $errors),
                    'arrived_quantity' => $qty,
                    'condition_notes' => self::text($itemVals['condition_notes'] ?? null, array_key_exists('condition_notes', $itemVals), "$ptr/condition_notes", 500, false, $errors),
                ];
            }
        }

        $intakeEvidence = null;
        if (array_key_exists('intake_evidence', $vals) && $vals['intake_evidence'] !== null) {
            $intakeEvidence = self::evidence($vals['intake_evidence'], '/intake_evidence', $errors);
        }

        return [
            'arrived_at' => self::instant($vals['arrived_at'] ?? null, array_key_exists('arrived_at', $vals), '/arrived_at', false, $errors),
            'holding_location_id' => self::uuid($vals['holding_location_id'] ?? null, array_key_exists('holding_location_id', $vals), '/holding_location_id', false, $errors),
            'carrier_or_sender_name' => self::text($vals['carrier_or_sender_name'] ?? null, array_key_exists('carrier_or_sender_name', $vals), '/carrier_or_sender_name', 200, false, $errors),
            'sender_kind' => self::enum($vals['sender_kind'] ?? null, array_key_exists('sender_kind', $vals), '/sender_kind', self::SENDER_KINDS, $errors),
            'delivery_document_reference' => self::text($vals['delivery_document_reference'] ?? null, array_key_exists('delivery_document_reference', $vals), '/delivery_document_reference', 80, true, $errors),
            'hold_reason' => self::text($vals['hold_reason'] ?? null, array_key_exists('hold_reason', $vals), '/hold_reason', 500, false, $errors),
            'items' => $items,
            'intake_evidence' => $intakeEvidence,
        ];
    }

    private static function validateLinkHoldSource(stdClass $raw, array &$errors): array
    {
        $required = [
            'expected_version', 'expected_material_version', 'source_kind', 'source_id',
            'supplier_dr_reference', 'supplier_dr_date', 'link_notes',
        ];
        $vals = self::objectKeys($raw, $required, '', $errors);
        $sourceKind = self::enum($vals['source_kind'] ?? null, array_key_exists('source_kind', $vals), '/source_kind', self::SOURCE_KINDS, $errors);
        $drRef = self::text($vals['supplier_dr_reference'] ?? null, array_key_exists('supplier_dr_reference', $vals), '/supplier_dr_reference', 80, true, $errors);
        $drDate = self::isoDate($vals['supplier_dr_date'] ?? null, array_key_exists('supplier_dr_date', $vals), '/supplier_dr_date', true, $errors);

        self::enforceDrPairForSourceKind($sourceKind, $drRef, $drDate, $errors);

        return self::versions($vals, $errors) + [
            'source_kind' => $sourceKind,
            'source_id' => self::uuid($vals['source_id'] ?? null, array_key_exists('source_id', $vals), '/source_id', false, $errors),
            'supplier_dr_reference' => $drRef,
            'supplier_dr_date' => $drDate,
            'link_notes' => self::text($vals['link_notes'] ?? null, array_key_exists('link_notes', $vals), '/link_notes', 500, false, $errors),
        ];
    }

    private static function validateRejectReturnHold(stdClass $raw, array &$errors): array
    {
        $vals = self::objectKeys($raw, [
            'expected_version', 'expected_material_version', 'reason',
            'recipient_or_carrier_name', 'evidence', 'signed_at',
        ], '', $errors);

        return self::versions($vals, $errors) + [
            'reason' => self::text($vals['reason'] ?? null, array_key_exists('reason', $vals), '/reason', 500, false, $errors),
            'recipient_or_carrier_name' => self::text($vals['recipient_or_carrier_name'] ?? null, array_key_exists('recipient_or_carrier_name', $vals), '/recipient_or_carrier_name', 200, false, $errors),
            'evidence' => array_key_exists('evidence', $vals) ? self::evidence($vals['evidence'], '/evidence', $errors) : [],
            'signed_at' => self::instant($vals['signed_at'] ?? null, array_key_exists('signed_at', $vals), '/signed_at', false, $errors),
        ];
    }

    /** @return list<array<string, mixed>> */
    private static function validateReportLines(array $vals, ?string $sourceKind, array &$errors): array
    {
        $lines = [];
        if (! array_key_exists('lines', $vals)) {
            return $lines;
        }
        $seenSourceLines = [];
        foreach (self::listOf($vals['lines'], '/lines', 1, 100, $errors) as $i => $rawLine) {
            $ptr = "/lines/{$i}";
            if (! $rawLine instanceof stdClass) {
                $errors[] = self::field($ptr, 'invalid_type', 'A line object is required.');

                continue;
            }
            $keys = [
                'source_line_id', 'variant_id', 'unit_id', 'delivered_quantity', 'accepted_quantity',
                'damaged_quantity', 'rejected_quantity', 'unit_valuation_php', 'discrepancy_notes',
                'resolves_discrepancy_id',
            ];
            $lineVals = self::objectKeys($rawLine, $keys, $ptr, $errors);
            $sourceLineId = self::uuid($lineVals['source_line_id'] ?? null, array_key_exists('source_line_id', $lineVals), "$ptr/source_line_id", false, $errors);
            if ($sourceLineId !== null) {
                if (isset($seenSourceLines[$sourceLineId])) {
                    $errors[] = self::field("$ptr/source_line_id", 'invalid_format', 'Duplicate source_line_id in receiving report.');
                }
                $seenSourceLines[$sourceLineId] = true;
            }

            $delivered = self::pattern($lineVals['delivered_quantity'] ?? null, array_key_exists('delivered_quantity', $lineVals), "$ptr/delivered_quantity", OpeningDraftInput::STOCK_QTY, false, $errors);
            if ($delivered !== null && preg_match('/\A0(?:\.0+)?\z/', $delivered)) {
                $errors[] = self::field("$ptr/delivered_quantity", 'invalid_format', 'Delivered quantity must be greater than zero.');
            }
            $accepted = self::pattern($lineVals['accepted_quantity'] ?? null, array_key_exists('accepted_quantity', $lineVals), "$ptr/accepted_quantity", OpeningDraftInput::STOCK_QTY, false, $errors);
            $damaged = self::pattern($lineVals['damaged_quantity'] ?? null, array_key_exists('damaged_quantity', $lineVals), "$ptr/damaged_quantity", OpeningDraftInput::STOCK_QTY, false, $errors);
            $rejected = self::pattern($lineVals['rejected_quantity'] ?? null, array_key_exists('rejected_quantity', $lineVals), "$ptr/rejected_quantity", OpeningDraftInput::STOCK_QTY, false, $errors);
            $notes = self::text($lineVals['discrepancy_notes'] ?? null, array_key_exists('discrepancy_notes', $lineVals), "$ptr/discrepancy_notes", 500, true, $errors);
            $resolvesId = self::uuid($lineVals['resolves_discrepancy_id'] ?? null, array_key_exists('resolves_discrepancy_id', $lineVals), "$ptr/resolves_discrepancy_id", true, $errors);

            if ($delivered !== null && $accepted !== null && $damaged !== null && $rejected !== null
                && preg_match(OpeningDraftInput::STOCK_QTY, $delivered)
                && preg_match(OpeningDraftInput::STOCK_QTY, $accepted)
                && preg_match(OpeningDraftInput::STOCK_QTY, $damaged)
                && preg_match(OpeningDraftInput::STOCK_QTY, $rejected)) {
                $sum = BigDecimal::of($accepted)->plus($damaged)->plus($rejected);
                if (BigDecimal::of($delivered)->compareTo($sum) !== 0) {
                    $errors[] = self::field("$ptr/delivered_quantity", 'invalid_format', 'delivered_quantity must equal accepted_quantity + damaged_quantity + rejected_quantity.');
                }
                if ((BigDecimal::of($damaged)->isPositive() || BigDecimal::of($rejected)->isPositive()) && $notes === null) {
                    $errors[] = self::field("$ptr/discrepancy_notes", 'required', 'discrepancy_notes is required when damaged_quantity or rejected_quantity is greater than zero.');
                }
            }
            if ($sourceKind === 'da' && $resolvesId !== null) {
                $errors[] = self::field("$ptr/resolves_discrepancy_id", 'invalid_format', 'resolves_discrepancy_id must be null for DA-RM.');
            }

            $lines[] = [
                'source_line_id' => $sourceLineId,
                'variant_id' => self::uuid($lineVals['variant_id'] ?? null, array_key_exists('variant_id', $lineVals), "$ptr/variant_id", false, $errors),
                'unit_id' => self::uuid($lineVals['unit_id'] ?? null, array_key_exists('unit_id', $lineVals), "$ptr/unit_id", false, $errors),
                'delivered_quantity' => $delivered,
                'accepted_quantity' => $accepted,
                'damaged_quantity' => $damaged,
                'rejected_quantity' => $rejected,
                'unit_valuation_php' => self::pattern($lineVals['unit_valuation_php'] ?? null, array_key_exists('unit_valuation_php', $lineVals), "$ptr/unit_valuation_php", OpeningDraftInput::PHP_MONEY, false, $errors),
                'discrepancy_notes' => $notes,
                'resolves_discrepancy_id' => $resolvesId,
            ];
        }

        return $lines;
    }

    public static function enforceDrPairForSourceKind(?string $sourceKind, ?string $drRef, ?string $drDate, array &$errors): void
    {
        if ($sourceKind === 'po') {
            if ($drRef === null) {
                $errors[] = self::field('/supplier_dr_reference', 'required', 'supplier_dr_reference is required for PO receiving.');
            }
            if ($drDate === null) {
                $errors[] = self::field('/supplier_dr_date', 'required', 'supplier_dr_date is required for PO receiving.');
            }
        } elseif ($sourceKind === 'da') {
            if ($drRef !== null) {
                $errors[] = self::field('/supplier_dr_reference', 'invalid_format', 'supplier_dr_reference must be null for DA receiving.');
            }
            if ($drDate !== null) {
                $errors[] = self::field('/supplier_dr_date', 'invalid_format', 'supplier_dr_date must be null for DA receiving.');
            }
        }
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

    private static function isoDate(mixed $val, bool $present, string $ptr, bool $nullable, array &$errors): ?string
    {
        $str = self::rawString($val, $present, $ptr, $nullable, $errors);
        if ($str === null) {
            return null;
        }
        if (! preg_match('/\A\d{4}-\d{2}-\d{2}\z/', $str)) {
            $errors[] = self::field($ptr, 'invalid_format', 'Valid YYYY-MM-DD date required.');

            return $str;
        }
        [$year, $month, $day] = array_map('intval', explode('-', $str));
        if (! checkdate($month, $day, $year)) {
            $errors[] = self::field($ptr, 'invalid_format', 'Valid calendar date required.');
        }

        return $str;
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
