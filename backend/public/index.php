<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require __DIR__.'/../vendor/autoload.php';

// PHP's automatic multipart parsing collapses repeated unbracketed file parts.
if (! ini_get('enable_post_data_reading') && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $path = rawurldecode(explode('?', $_SERVER['REQUEST_URI'] ?? '', 2)[0]);
    $mediaType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '', 2)[0]));
    if (! preg_match('~^/api/v1/chapters/[^/]+/evidence/?$~D', $path)
        && in_array($mediaType, ['multipart/form-data', 'application/x-www-form-urlencoded'], true)) {
        try {
            [$_POST, $_FILES] = request_parse_body();
        } catch (RequestParseBodyException) {
            // Keep the normal empty-input behavior when PHP cannot parse a legacy form.
        }
    }
}

// Bootstrap Laravel and handle the request...
/** @var Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';

$app->handleRequest(Request::capture());
