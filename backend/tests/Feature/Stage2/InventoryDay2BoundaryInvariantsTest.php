<?php

namespace Tests\Feature\Stage2;

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Tests\TestCase;

class InventoryDay2BoundaryInvariantsTest extends TestCase
{
    public function test_stage2_day2_participants_expose_zero_public_http_routes_while_stage1_opening_rms_remain_mounted(): void
    {
        $chapterId = (string) Str::uuid();
        $daId = (string) Str::uuid();

        $routeUris = collect(Route::getRoutes()->getRoutes())
            ->map(fn ($route) => '/'.ltrim($route->uri(), '/'))
            ->values()
            ->all();

        foreach ($routeUris as $uri) {
            $this->assertStringNotContainsString('apply-lot-restriction', $uri);
            $this->assertStringNotContainsString('prepare-receiving', $uri);
        }

        // Stage 1 /opening-rms routes remain intact per RCV-08..10 boundary.
        $hasOpeningRmRoutes = collect($routeUris)->contains(
            fn (string $uri) => str_contains($uri, '/opening-rms')
        );
        $this->assertTrue($hasOpeningRmRoutes, 'Stage 1 /opening-rms routes must remain mounted.');

        $this->postJson("/api/v1/chapters/{$chapterId}/apply-lot-restriction", [])->assertStatus(404);
        $this->postJson("/api/v1/chapters/{$chapterId}/donations/{$daId}/apply-lot-restriction", [])->assertStatus(404);
    }

    public function test_stage2_contracts_enforce_quarantine_close_short_holds_and_co_emission_rules(): void
    {
        $handoffYaml = file_get_contents(base_path('../contracts/stage2/handoff.yaml'));
        $eventsYaml = file_get_contents(base_path('../contracts/stage2/events.yaml'));
        $openapiYaml = file_get_contents(base_path('../contracts/stage2/openapi.yaml'));
        $validatePy = file_get_contents(base_path('../contracts/stage2/validate.py'));

        $this->assertNotFalse($handoffYaml);
        $handoffYaml = str_replace("\r\n", "\n", $handoffYaml);
        $this->assertNotFalse($eventsYaml);
        $eventsYaml = str_replace("\r\n", "\n", $eventsYaml);
        $this->assertNotFalse($openapiYaml);
        $openapiYaml = str_replace("\r\n", "\n", $openapiYaml);
        $this->assertNotFalse($validatePy);

        $this->assertStringContainsString('/apply-lot-restriction', $validatePy);
        $this->assertStringContainsString('quarantined_lots_auto_cleared_on_source_close', $validatePy);
        $this->assertStringContainsString('usable_stock_posted', $validatePy);
        $this->assertStringContainsString('ipc_creation_prohibited', $validatePy);

        $participantPos = strpos($handoffYaml, "  applyLotRestrictionResolution:\n");
        $this->assertNotFalse($participantPos);
        $participantBlock = substr($handoffYaml, $participantPos, 400);
        $this->assertStringContainsString('owner: Efren', $participantBlock);
        $this->assertStringContainsString('public_http_route: false', $participantBlock);
        $this->assertStringContainsString('commit: caller_owned_single_mysql_transaction', $participantBlock);

        $eventPos = strpos($eventsYaml, "  stage1.stock-lot.changed.v1:\n");
        $this->assertNotFalse($eventPos);
        $eventBlock = substr($eventsYaml, $eventPos, 650);
        $this->assertStringContainsString('owner: Efren', $eventBlock);
        $this->assertStringContainsString('logical_channel: private-stage1.chapter.{chapter_id}', $eventBlock);
        $this->assertStringContainsString('delivery_channel: private-stage1.chapter.{chapter_id}.user.{user_id}', $eventBlock);
        $this->assertStringContainsString('- postReceivingReport', $eventBlock);
        $this->assertStringContainsString('- resolveDonationRestriction', $eventBlock);

        $appliedPos = strpos($openapiYaml, "    DonationAppliedRestriction:\n");
        $this->assertNotFalse($appliedPos);
        $appliedBlock = substr($openapiYaml, $appliedPos, 420);
        $this->assertStringContainsString("- bounded\n", $appliedBlock);
        $this->assertStringContainsString("- unrestricted\n", $appliedBlock);
        $this->assertStringNotContainsString("- uninterpreted\n", $appliedBlock);

        $discResPos = strpos($openapiYaml, "        quarantined_lots_auto_cleared_on_source_close:\n");
        $this->assertNotFalse($discResPos);
        $discResBlock = substr($openapiYaml, $discResPos, 150);
        $this->assertStringContainsString('const: false', $discResBlock);

        $holdPos = strpos($openapiYaml, "    ReceivingHold:\n");
        $this->assertNotFalse($holdPos);
        $holdBlock = substr($openapiYaml, $holdPos, 2400);
        $this->assertStringContainsString('usable_stock_posted:', $holdBlock);
        $this->assertStringContainsString('ipc_creation_prohibited:', $holdBlock);
        $this->assertStringContainsString('const: false', $holdBlock);
        $this->assertStringContainsString('const: true', $holdBlock);
    }
}
