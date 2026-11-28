<?php

namespace App\Services\Shared;

use App\Models\CatalogueLocation;
use App\Models\CatalogueVariant;
use App\Models\InternalRfLine;
use App\Models\PolicyRecord;
use App\Models\ReceivingReportLine;
use App\Services\Authority\ChapterAuthority;
use Brick\Math\BigDecimal;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class Stage2ReportRecords
{
    public const OPEN_PO = ['issued', 'partially_received'];

    public const OPEN_DISCREPANCY = ['open', 'supplier_notified', 'under_review'];

    public static function period(Builder $query, string $column, array $filters): Builder
    {
        return $query->where($column, '>=', self::periodStart($filters['date_from']))
            ->where($column, '<', self::periodStart($filters['date_to'])->addDay());
    }

    public static function periodStart(string $date): CarbonImmutable
    {
        return CarbonImmutable::parse($date, 'Asia/Manila')->utc();
    }

    public static function variants(string $chapterId, array $filters = []): Builder
    {
        return CatalogueVariant::where('chapter_id', $chapterId)
            ->when($filters['variant_id'] ?? null, fn ($query, $id) => $query->whereKey($id))
            ->when($filters['item_id'] ?? null, fn ($query, $id) => $query->where('item_id', $id));
    }

    public static function rfLines(string $chapterId, ?array $filters = null): Builder
    {
        return InternalRfLine::whereIn('variant_id', self::variants($chapterId, $filters ?? [])->select('id'))
            ->whereHas('rf', function (Builder $query) use ($chapterId, $filters) {
                $query->where('chapter_id', $chapterId)->whereNotNull('approved_at');
                if ($filters !== null) {
                    self::period($query, 'approved_at', $filters);
                }
            })
            ->where('approved_quantity', '>', 0)
            ->with('rf')
            ->orderBy('id');
    }

    public static function outstanding(InternalRfLine $line): string
    {
        return BcMath::max('0', BcMath::sub(BcMath::sub($line->approved_quantity, $line->issued_quantity), $line->canceled_quantity));
    }

    public static function shortage(InternalRfLine $line): string
    {
        return BcMath::max('0', BcMath::sub(self::outstanding($line), $line->reserved_quantity));
    }

    public static function receipts(string $chapterId, string $source): Builder
    {
        return ReceivingReportLine::whereHas('receivingReport', fn (Builder $query) => $query
            ->where('chapter_id', $chapterId)->where('source_kind', $source)->where('status', 'posted'))
            ->with('receivingReport');
    }

    public static function poReceiptLocations(string $chapterId, Collection $variantIds): Collection
    {
        return self::receipts($chapterId, 'po')->whereIn('variant_id', $variantIds)->orderBy('id')->get()
            ->sortByDesc(fn ($line) => $line->receivingReport->posted_at)->groupBy('receivingReport.source_id')
            ->map(fn (Collection $lines) => $lines->pluck('receivingReport.location_id')->unique()->values());
    }

    public static function policy(string $chapterId, string $code, string $owner, string $schema, CarbonImmutable $at): ?array
    {
        return PolicyRecord::where('chapter_id', $chapterId)->where('policy_code', $code)
            ->where('effective_from', '<=', $at)->orderByDesc('effective_from')->orderByDesc('policy_version')->orderBy('id')->get()
            ->first(fn (PolicyRecord $policy) => ChapterAuthority::policyState($policy, $owner, $schema, at: $at) === 'effective')?->rules_json;
    }

    public static function deliveryLocation(string $value, Collection $locations): ?CatalogueLocation
    {
        $matches = $locations->filter(fn ($location) => $location->id === $value || $location->name === $value);

        return $matches->count() === 1 ? $matches->first() : null;
    }

    public static function rfLinesAtLocation(string $chapterId, string $locationId): array
    {
        $lots = DB::table('inventory_lots')->where('chapter_id', $chapterId)->where('location_id', $locationId)->select('id');
        $issued = DB::table('actual_issue_lines')->whereIn('lot_id', clone $lots)
            ->whereIn('actual_issue_id', DB::table('actual_issues')->where('chapter_id', $chapterId)->where('status', 'posted')->select('id'))
            ->select('requisition_line_id');
        $allocations = DB::table('rf_reservation_allocations')->where('chapter_id', $chapterId)
            ->whereIn('lot_id', clone $lots)->select('reservation_id');

        return DB::table('stock_reservations')->where('chapter_id', $chapterId)->whereNotNull('rf_line_id')
            ->where(fn ($query) => $query->whereIn('id', $allocations)->orWhereIn('lot_id', $lots))
            ->select('rf_line_id')->union($issued)->pluck('rf_line_id')->flip()->all();
    }

    public static function sum(Collection $rows, string $field, int $scale = 2): string
    {
        return (string) $rows->reduce(
            fn (BigDecimal $total, $row) => $total->plus(data_get($row, $field)),
            BigDecimal::zero(),
        )->toScale($scale);
    }
}
