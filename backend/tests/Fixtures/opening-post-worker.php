<?php

/**
 * Isolated worker process for real MySQL multi-worker concurrency tests.
 * Reads a JSON job from STDIN and dispatches an authenticated HTTP POST through the Laravel HTTP Kernel.
 */

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;

$job = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
$origin = $job['origin'];
putenv("APP_URL={$origin}");
$_ENV['APP_URL'] = $origin;
$_SERVER['APP_URL'] = $origin;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$kernel = $app->make(Kernel::class);

$request = Request::create(
    $origin.$job['path'],
    'POST',
    [],
    ['ysp_session' => $job['token']],
    [],
    [
        'HTTP_ACCEPT' => 'application/json',
        'HTTP_ORIGIN' => $origin,
        'HTTP_X_XSRF_TOKEN' => $job['csrf'],
        'HTTP_X_ACTION_KEY' => $job['action_key'],
        'CONTENT_TYPE' => 'application/json',
        'HTTPS' => 'on',
    ],
    json_encode($job['body'], JSON_THROW_ON_ERROR),
);

$response = $kernel->handle($request);
$kernel->terminate($request, $response);

echo json_encode([
    'status' => $response->getStatusCode(),
    'replayed' => $response->headers->get('X-Action-Replayed'),
    'body' => json_decode((string) $response->getContent(), true),
], JSON_THROW_ON_ERROR);
