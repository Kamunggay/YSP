<?php

namespace App\Http\Controllers;

use App\Http\Requests\RepfInput;
use App\Http\Requests\Stage2ReportInput;
use App\Http\Resources\RepfResource;
use App\Services\Authority\ChapterAuthority;
use App\Services\Inventory\OfficerAlerts;
use App\Services\Shared\SnapshotPage;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class OfficerAlertController
{
    public function __invoke(Request $request, OfficerAlerts $alerts, string $chapterId): JsonResponse
    {
        $selectors = RepfInput::selectors($request, ['alert_type', 'severity', 'responsible_duty', 'limit', 'cursor']);
        $authority = $request->attributes->get(ChapterAuthority::class);
        $duties = array_values(array_intersect($authority->duties(), ChapterAuthority::ACTION_DUTIES['alerts.read']));
        $filters = [];
        foreach (['alert_type' => OfficerAlerts::TYPES, 'severity' => ['critical', 'warning', 'info'], 'responsible_duty' => ChapterAuthority::DUTIES] as $name => $allowed) {
            if (isset($selectors[$name])) {
                $filters[$name] = Stage2ReportInput::oneOf($selectors[$name], $allowed);
            }
        }
        $limit = Stage2ReportInput::limit($selectors);
        $now = CarbonImmutable::now('UTC');
        $rows = $alerts->build($authority, $duties, $filters, $now);

        return response()->json([
            'caller_matched_duties' => $duties,
            'persisted_ack_supported' => false,
            'observed_at' => RepfResource::instant($now),
        ] + SnapshotPage::sections($request, $chapterId, 'alerts', $filters, $limit, $selectors['cursor'] ?? null, ['data' => $rows]));
    }
}
