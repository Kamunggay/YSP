<?php

namespace App\Http\Requests;

use App\Exceptions\ContractException;
use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueVariant;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

final class Stage2ReportInput
{
    public static function filters(Request $request, string $chapterId, string $kind, bool $print): array
    {
        $fields = ['date_from', 'date_to', 'item_id', 'variant_id', 'location_id', 'status'];
        $selectors = RepfInput::selectors($request, $print ? $fields : [...$fields, 'limit', 'cursor']);
        [$from, $to] = array_map(
            fn (string $field) => self::date($selectors[$field] ?? ''),
            ['date_from', 'date_to'],
        );
        if ($from > $to || $from->diffInDays($to) >= 366) {
            throw new ContractException(400, 'invalid_selector', 'Select a date range of at most 366 days.');
        }

        $statuses = match ($kind) {
            'inventory' => ['low_stock', 'with_shortage', 'with_quarantine', 'with_uninterpreted_restriction', 'normal'],
            'procurement' => ['open_demand', 'awaiting_approval', 'in_procurement', 'partially_received', 'with_discrepancy', 'demand_changed', 'closed'],
            'control' => ['uninterpreted_restriction', 'bounded_restriction', 'overdue_exception', 'discrepancy_open', 'hold_open', 'resolved'],
        };
        $filters = [
            'date_from' => $from->toDateString(),
            'date_to' => $to->toDateString(),
            'item_id' => $selectors['item_id'] ?? null,
            'variant_id' => $selectors['variant_id'] ?? null,
            'location_id' => $selectors['location_id'] ?? null,
            'status' => self::oneOf($selectors['status'] ?? 'all', ['all', ...$statuses]),
        ];
        $limit = self::limit($selectors);
        $variant = null;
        foreach (['item_id' => CatalogueItem::class, 'variant_id' => CatalogueVariant::class, 'location_id' => CatalogueLocation::class] as $key => $model) {
            if ($filters[$key] === null) {
                continue;
            }
            $record = $model::where('chapter_id', $chapterId)->find(OpeningDraftInput::requireUuid($filters[$key]));
            if ($record === null) {
                throw new ContractException(404, 'resource_not_found', 'Resource not found.');
            }
            if ($key === 'variant_id') {
                $variant = $record;
            }
        }
        if ($filters['item_id'] !== null && $variant !== null && $variant->item_id !== $filters['item_id']) {
            throw new ContractException(400, 'invalid_selector', 'Variant does not belong to the selected item.');
        }

        return [$filters, $limit, $selectors['cursor'] ?? null];
    }

    public static function limit(array $selectors): int
    {
        $limit = $selectors['limit'] ?? '25';
        if (! preg_match('/\A(?:[1-9][0-9]?|100)\z/', $limit)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid limit.');
        }

        return (int) $limit;
    }

    public static function oneOf(string $value, array $allowed): string
    {
        if (! in_array($value, $allowed, true)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid query selector.');
        }

        return $value;
    }

    private static function date(string $value): CarbonImmutable
    {
        if (! preg_match('/\A([0-9]{4})-([0-9]{2})-([0-9]{2})\z/', $value, $parts)
            || ! checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1])
            || (int) $parts[1] < 1000) {
            throw new ContractException(400, 'invalid_selector', 'Use valid date_from and date_to dates.');
        }

        return CarbonImmutable::parse($value, 'Asia/Manila');
    }
}
