<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ConnectivityTest extends TestCase
{
    public function test_running_laravel_reaches_mysql(): void
    {
        $response = Http::acceptJson()->timeout(10)->get('http://127.0.0.1:8000/api/health');

        $this->assertSame(200, $response->status());
        $this->assertSame(['database' => 'connected'], $response->json());
    }
}
