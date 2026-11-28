<?php

namespace Tests\Feature\Stage2;

use App\Services\Notifications\DomainNotificationOutboxService;
use Illuminate\Routing\Route as LaravelRoute;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use InvalidArgumentException;
use ReflectionClass;
use Tests\TestCase;

class SalesDay1BoundaryTest extends TestCase
{
    public function test_stage2_contracts_exclude_sales_orders_invoices_payments_booths_adj_and_deferred_reports_for_efren(): void
    {
        $handoffYaml = file_get_contents(base_path('../contracts/stage2/handoff.yaml'));
        $openapiYaml = file_get_contents(base_path('../contracts/stage2/openapi.yaml'));
        $validatePy = file_get_contents(base_path('../contracts/stage2/validate.py'));

        $this->assertNotFalse($handoffYaml);
        $handoffYaml = str_replace("\r\n", "\n", $handoffYaml);
        $this->assertNotFalse($openapiYaml);
        $openapiYaml = str_replace("\r\n", "\n", $openapiYaml);
        $this->assertNotFalse($validatePy);

        // RepF trigger kind strictly allows rf_shortage & rop_replenishment, never so_shortage.
        $repfPos = strpos($openapiYaml, "    RepfTriggerKind:\n");
        $this->assertNotFalse($repfPos);
        $repfBlock = substr($openapiYaml, $repfPos, 350);
        $this->assertStringContainsString("- rf_shortage\n", $repfBlock);
        $this->assertStringContainsString("- rop_replenishment\n", $repfBlock);
        $this->assertStringContainsString('strictly exclude Stage 3 so_shortage', $repfBlock);

        // ADR 0004 BoundedRestriction vocabulary retains internal_use, sale, booth_custody.
        $restrictionPos = strpos($openapiYaml, "    BoundedRestriction:\n");
        $this->assertNotFalse($restrictionPos);
        $restrictionBlock = substr($openapiYaml, $restrictionPos, 700);
        foreach (['internal_use', 'sale', 'booth_custody'] as $use) {
            $this->assertStringContainsString("- {$use}\n", $restrictionBlock);
        }

        // All Sales, Billing, Payment, Booth, Adjustment, and Finance/Booth export paths stay forbidden in Stage 2.
        foreach ([
            '/sales-orders',
            '/sales-invoices',
            '/payments',
            '/official-receipts',
            '/booths',
            '/adjustments',
            '/adj',
            '/reports/finance',
            '/reports/booth',
            '/export',
        ] as $forbiddenPath) {
            $this->assertStringContainsString("\"{$forbiddenPath}\"", $validatePy);
        }

        // Efren owns 0 Stage 2 HTTP profiles and 0 Sales participants; Stages 3-4 stay deferred.
        $profilesPos = strpos($handoffYaml, "\nprofiles:\n");
        $procsPos = strpos($handoffYaml, "\ncontrolled_procedures:\n");
        $this->assertNotFalse($profilesPos);
        $this->assertNotFalse($procsPos);
        $profilesSection = substr($handoffYaml, $profilesPos, $procsPos - $profilesPos);
        $this->assertDoesNotMatchRegularExpression('/^\s{4}owner:\s+Efren$/m', $profilesSection);

        $partPos = strpos($handoffYaml, "\ninternal_participants:\n");
        $dutiesPos = strpos($handoffYaml, "\naction_duties:\n");
        $this->assertNotFalse($partPos);
        $this->assertNotFalse($dutiesPos);
        $participantsSection = substr($handoffYaml, $partPos, $dutiesPos - $partPos);
        $this->assertDoesNotMatchRegularExpression('/^\s{2}(?!prepareReceivingInventory:|applyLotRestrictionResolution:|checkEvidenceBinding:|computeNetShortageSnapshot:)[a-zA-Z0-9_]+:$/m', $participantsSection);

        $this->assertStringContainsString('stage3_sales_and_payments:', $handoffYaml);
        $this->assertStringContainsString('stage4_booths_and_adj:', $handoffYaml);
        $this->assertStringContainsString('rpt05_finance_and_booth_reports:', $handoffYaml);
        $this->assertStringContainsString('rpt07_binary_exports:', $handoffYaml);
    }

    public function test_router_and_http_boundary_reject_deferred_stage2_sales_billing_booth_adj_and_report_routes(): void
    {
        $apiUris = collect(Route::getRoutes()->getRoutes())
            ->map(fn (LaravelRoute $route) => '/'.ltrim($route->uri(), '/'))
            ->all();

        $deferredOrExcludedFragments = [
            '/sales-invoices',
            '/payments',
            '/official-receipts',
            '/booths',
            '/adjustments',
            '/adj',
            '/reports/finance',
            '/reports/booth',
            '/export',
        ];

        foreach ($deferredOrExcludedFragments as $fragment) {
            foreach ($apiUris as $uri) {
                $this->assertStringNotContainsString(
                    $fragment,
                    $uri,
                    "Stage 2 Sales Day 1 boundary violated: unexpected route {$uri} matches {$fragment}"
                );
            }
        }

        $chapterId = (string) Str::uuid();
        foreach ([
            ['GET', "/api/v1/chapters/{$chapterId}/sales-invoices"],
            ['POST', "/api/v1/chapters/{$chapterId}/sales-invoices"],
            ['POST', "/api/v1/chapters/{$chapterId}/payments"],
            ['GET', "/api/v1/chapters/{$chapterId}/official-receipts"],
            ['GET', "/api/v1/chapters/{$chapterId}/booths"],
            ['POST', "/api/v1/chapters/{$chapterId}/adjustments"],
            ['POST', "/api/v1/chapters/{$chapterId}/adj"],
            ['GET', "/api/v1/chapters/{$chapterId}/reports/finance"],
            ['GET', "/api/v1/chapters/{$chapterId}/reports/booth"],
            ['GET', "/api/v1/chapters/{$chapterId}/reports/inventory/export"],
        ] as [$method, $path]) {
            $this->json($method, $path)->assertNotFound();
        }
    }

    public function test_outbox_registry_contains_zero_stage2_sales_payment_or_booth_events(): void
    {
        $eventMap = (new ReflectionClass(DomainNotificationOutboxService::class))->getConstant('EVENT_MAP');
        $this->assertIsArray($eventMap);

        foreach (array_keys($eventMap) as $eventName) {
            foreach (['sales', 'invoice', 'payment', 'official', 'booth', 'adjustment'] as $blocked) {
                $this->assertStringNotContainsString($blocked, $eventName);
            }
        }

        $outbox = app(DomainNotificationOutboxService::class);
        $this->expectException(InvalidArgumentException::class);
        $outbox->recordIntent('stage2.sales-order.changed.v1', (string) Str::uuid(), (string) Str::uuid());
    }
}
