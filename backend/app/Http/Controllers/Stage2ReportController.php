<?php

namespace App\Http\Controllers;

use App\Http\Requests\Stage2ReportInput;
use App\Http\Resources\RepfResource;
use App\Services\Authority\ChapterAuthority;
use App\Services\Inventory\InventoryReport;
use App\Services\Procurement\ProcurementReport;
use App\Services\Receiving\ControlReport;
use App\Services\Shared\SnapshotPage;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class Stage2ReportController
{
    public function show(Request $request, string $chapterId): Response
    {
        $kind = $request->route()->defaults['report_kind'];
        $print = $request->route()->defaults['print'];
        [$filters, $limit, $cursor] = Stage2ReportInput::filters($request, $chapterId, $kind, $print);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $now = CarbonImmutable::now('UTC');

        [$sections, $totals, $labels] = match ($kind) {
            'inventory' => app(InventoryReport::class)->build($chapterId, $filters, $now),
            'procurement' => app(ProcurementReport::class)->build($chapterId, $filters, $now),
            'control' => app(ControlReport::class)->build($chapterId, $filters, $now),
        };
        $metadata = [
            'report_kind' => $kind,
            'chapter_id' => $chapterId,
            'chapter_name' => $authority->chapter->name,
            'currency_code' => 'PHP',
            'currency_label' => 'Philippine Peso (PHP)',
            'generated_at' => RepfResource::instant($now),
            'filters' => $filters,
        ];
        if ($print) {
            return response()->view('reports.stage2', compact('metadata', 'sections', 'totals', 'labels'), 200, [
                'Cache-Control' => 'no-store',
                'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
                'X-Content-Type-Options' => 'nosniff',
            ]);
        }

        return response()->json(['metadata' => $metadata, ...$labels, 'totals' => $totals]
            + SnapshotPage::sections($request, $chapterId, "reports.$kind", $filters, $limit, $cursor, $sections,
                [$authority->chapter->name, $totals, $labels]));
    }
}
