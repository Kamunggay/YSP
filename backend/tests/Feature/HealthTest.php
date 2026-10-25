<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class HealthTest extends TestCase
{
    public function test_missing_application_key_reports_configuration_failure(): void
    {
        config(['app.key' => '']);

        $this->getJson('/api/v1/health')
            ->assertStatus(503)
            ->assertExactJson(['status' => 'unavailable', 'database' => 'unavailable']);
    }

    public function test_invalid_credentials_report_only_safe_unavailability(): void
    {
        config(['database.connections.mysql.password' => 'invalid-secret-for-negative-test']);

        $this->getJson('/api/v1/health')
            ->assertStatus(503)
            ->assertExactJson(['status' => 'unavailable', 'database' => 'unavailable'])
            ->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_health_reports_database_connectivity_without_internal_details(): void
    {
        $this->getJson('/api/v1/health')
            ->assertOk()
            ->assertExactJson(['status' => 'ok', 'database' => 'ok'])
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertHeaderMissing('Set-Cookie');
    }
}
