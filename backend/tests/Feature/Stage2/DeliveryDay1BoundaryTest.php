<?php

namespace Tests\Feature\Stage2;

use App\Http\Controllers\ActualIssueController;
use App\Services\Notifications\DomainNotificationOutboxService;
use Illuminate\Routing\Route as LaravelRoute;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use InvalidArgumentException;
use ReflectionClass;
use Tests\TestCase;

class DeliveryDay1BoundaryTest extends TestCase
{
    public function test_stage2_contracts_assign_zero_delivery_routes_participants_and_events_for_efren(): void
    {
        $handoffYaml = file_get_contents(base_path('../contracts/stage2/handoff.yaml'));
        $eventsYaml = file_get_contents(base_path('../contracts/stage2/events.yaml'));

        $this->assertNotFalse($handoffYaml);
        $handoffYaml = str_replace("\r\n", "\n", $handoffYaml);
        $this->assertNotFalse($eventsYaml);
        $eventsYaml = str_replace("\r\n", "\n", $eventsYaml);

        $this->assertStringContainsString(
            'status: candidate; required combined Efren and Glenn human review pending; not a passed runtime prerequisite',
            $handoffYaml
        );

        // Exactly 4 internal participants in Stage 2; Efren owns only Inventory participants, zero Delivery ones.
        $participantsBlock = $this->extractYamlSection($handoffYaml, 'internal_participants:', 'action_duties:');
        $this->assertSame(
            [
                'checkEvidenceBinding' => ['owner' => 'Leader', 'public_http_route' => 'false'],
                'computeNetShortageSnapshot' => ['owner' => 'Glenn', 'public_http_route' => 'false'],
                'applyLotRestrictionResolution' => ['owner' => 'Efren', 'public_http_route' => 'false'],
                'prepareReceivingInventory' => ['owner' => 'Efren', 'public_http_route' => 'false'],
            ],
            $this->parseSimpleMapping($participantsBlock, ['owner', 'public_http_route'])
        );

        // Ticket 05 inbound receiving HTTP profiles are Leader-owned with Efren strictly as reviewer.
        foreach (['receiving_reports', 'receiving_discrepancies', 'receiving_holds', 'receiving_operations'] as $profile) {
            $profileBlock = $this->extractProfileBlock($handoffYaml, $profile);
            $this->assertMatchesRegularExpression('/^\s{4}owner:\s+Leader$/m', $profileBlock, "Expected Leader to own {$profile}");
            $this->assertMatchesRegularExpression('/^\s{4}-\s+Efren$/m', $profileBlock, "Expected Efren as reviewer on {$profile}");
        }

        // Deferred Stage 3 Customer DR and Stage 4 Booth/ADJ scopes plus unchanged Stage 1 actual-issue seam.
        $this->assertStringContainsString('stage3_sales_and_payments:', $handoffYaml);
        $this->assertStringContainsString('stage4_booths_and_adj:', $handoffYaml);
        $compatibilityBlock = $this->extractYamlSection($handoffYaml, 'stage1_compatibility:', 'deferred_scope:');
        $this->assertMatchesRegularExpression('/repeatedRfFulfillmentUnchanged:\n\s+allocation_queue_owner:\s+Glenn\n\s+actual_issue_owner:\s+Efren\n\s+receiving_orchestrator:\s+Leader/', $compatibilityBlock);

        // Zero synthetic or Delivery-specific Stage 2 events.
        $this->assertStringContainsString('synthetic_alert_events_allowed: false', $eventsYaml);
        $definitionsBlock = $this->extractYamlSection($eventsYaml, 'definitions:', 'co_emitted_stage1_events:');
        preg_match_all('/^\s{2}(stage2\.[a-z0-9.-]+):$/m', $definitionsBlock, $eventMatches);
        $this->assertSame([
            'stage2.repf.changed.v1',
            'stage2.purchase-order.changed.v1',
            'stage2.donation.changed.v1',
            'stage2.receiving-report.changed.v1',
            'stage2.receiving-discrepancy.changed.v1',
            'stage2.receiving-hold.changed.v1',
        ], $eventMatches[1]);
    }

    public function test_router_and_http_boundary_reject_deferred_stage3_stage4_delivery_and_forbidden_stage2_participant_routes(): void
    {
        $apiUris = collect(Route::getRoutes()->getRoutes())
            ->map(fn (LaravelRoute $route) => '/'.ltrim($route->uri(), '/'))
            ->all();

        $forbiddenFragments = [
            '/booths',
            '/adjustments',
            '/adj',
            '/sales-invoices',
            '/payments',
            '/official-receipts',
            '/prepare-receiving',
            '/apply-lot-restriction',
        ];

        foreach ($forbiddenFragments as $fragment) {
            foreach ($apiUris as $uri) {
                $this->assertStringNotContainsString(
                    $fragment,
                    $uri,
                    "Stage 2 Delivery Day 1 boundary violated: unexpected route {$uri} matches {$fragment}"
                );
            }
        }

        $chapterId = (string) Str::uuid();
        foreach ([
            ['GET', "/api/v1/chapters/{$chapterId}/booths"],
            ['POST', "/api/v1/chapters/{$chapterId}/booths"],
            ['POST', "/api/v1/chapters/{$chapterId}/adjustments"],
            ['POST', "/api/v1/chapters/{$chapterId}/adj"],
            ['GET', "/api/v1/chapters/{$chapterId}/sales-invoices"],
            ['POST', "/api/v1/chapters/{$chapterId}/payments"],
            ['POST', "/api/v1/chapters/{$chapterId}/official-receipts"],
            ['POST', "/api/v1/chapters/{$chapterId}/prepare-receiving"],
            ['POST', "/api/v1/chapters/{$chapterId}/apply-lot-restriction"],
        ] as [$method, $path]) {
            $this->json($method, $path)->assertNotFound();
        }
    }

    public function test_stage1_actual_issue_delivery_seam_and_outbox_boundaries_remain_intact(): void
    {
        $actualIssueRoutes = collect(Route::getRoutes()->getRoutes())
            ->filter(fn (LaravelRoute $route) => $route->getControllerClass() === ActualIssueController::class)
            ->map(fn (LaravelRoute $route) => implode(',', $route->methods()).' /'.ltrim($route->uri(), '/'))
            ->values()
            ->all();

        $this->assertCount(14, $actualIssueRoutes);
        $this->assertContains('POST /api/v1/chapters/{chapter_id}/internal-rfs/{rf_id}/actual-issues', $actualIssueRoutes);
        $this->assertContains('POST /api/v1/chapters/{chapter_id}/actual-issues/{issue_id}/post', $actualIssueRoutes);

        $eventMap = (new ReflectionClass(DomainNotificationOutboxService::class))->getConstant('EVENT_MAP');
        $this->assertIsArray($eventMap);
        $this->assertSame(['channel' => 'chapter', 'resource_kind' => 'actual_issue'], $eventMap['stage1.actual-issue.changed.v1'] ?? null);
        $this->assertSame(['channel' => 'chapter', 'resource_kind' => 'stock_lot'], $eventMap['stage1.stock-lot.changed.v1'] ?? null);

        foreach (array_keys($eventMap) as $eventName) {
            $this->assertStringNotContainsString('booth', $eventName);
            $this->assertStringNotContainsString('adjustment', $eventName);
            $this->assertStringNotContainsString('handover', $eventName);
        }

        $outbox = app(DomainNotificationOutboxService::class);
        $this->expectException(InvalidArgumentException::class);
        $outbox->recordIntent('stage2.delivery.changed.v1', (string) Str::uuid(), (string) Str::uuid());
    }

    private function extractYamlSection(string $yaml, string $startMarker, string $endMarker): string
    {
        $start = strpos($yaml, "\n{$startMarker}");
        if ($start === false) {
            $start = str_starts_with($yaml, $startMarker) ? 0 : $this->fail("Missing section {$startMarker}");
        }
        $end = strpos($yaml, "\n{$endMarker}", $start + 1);
        $this->assertNotFalse($end, "Missing end marker {$endMarker}");

        return substr($yaml, $start, $end - $start);
    }

    private function extractProfileBlock(string $handoffYaml, string $profile): string
    {
        $marker = "\n  {$profile}:\n";
        $start = strpos($handoffYaml, $marker);
        $this->assertNotFalse($start, "Missing profile {$profile}");
        $next = strpos($handoffYaml, "\n    operations:", $start);
        $this->assertNotFalse($next, "Missing operations boundary for {$profile}");

        return substr($handoffYaml, $start, $next - $start);
    }

    /**
     * @param  list<string>  $keys
     * @return array<string, array<string, string>>
     */
    private function parseSimpleMapping(string $section, array $keys): array
    {
        $result = [];
        $current = null;
        foreach (explode("\n", $section) as $line) {
            if (preg_match('/^\s{2}([a-zA-Z0-9_]+):$/', $line, $m)) {
                $current = $m[1];
                $result[$current] = [];
            } elseif ($current !== null && preg_match('/^\s{4}([a-zA-Z0-9_]+):\s*(.+)$/', $line, $m) && in_array($m[1], $keys, true)) {
                $result[$current][$m[1]] = trim($m[2]);
            }
        }

        return $result;
    }
}
