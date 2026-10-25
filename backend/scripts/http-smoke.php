<?php

declare(strict_types=1);

$context = stream_context_create(['http' => ['ignore_errors' => true, 'timeout' => 15]]);
$body = @file_get_contents('http://127.0.0.1:8080/api/v1/health', false, $context);
$headers = $http_response_header ?? [];
$expectedStatus = (int) (getenv('HEALTH_EXPECT_STATUS') ?: 200);
$expected = $expectedStatus === 200
    ? ['status' => 'ok', 'database' => 'ok']
    : ['status' => 'unavailable', 'database' => 'unavailable'];
if (! str_contains($headers[0] ?? '', ' '.$expectedStatus.' ')
    || json_decode((string) $body, true) !== $expected
    || ! in_array('Cache-Control: no-store, private', $headers, true)) {
    fwrite(STDERR, "HTTP health smoke failed (response omitted).\n");
    exit(1);
}
echo 'HTTP health smoke passed: '.$expectedStatus."\n";
