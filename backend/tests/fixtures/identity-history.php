<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

// Intended-MySQL security seam, using the ordinary application's credentials.
if (getenv('YSP_SESSION_FIXTURES') !== '1' || ! preg_match('/^[1-9][0-9]*$/D', $argv[1] ?? '')) {
    exit(1);
}
require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$events = DB::table('global_security_events')->where('user_id', $argv[1]);
$original = $events->get()->toJson();
$assertions = ['identity_creation_recorded_once' => $events->count() === 1];
$grants = DB::select('SHOW GRANTS');
$assertions['runtime_cannot_remove_history_guards'] = ! preg_match(
    '/ALL PRIVILEGES|\\b(?:CREATE|ALTER|DROP|TRIGGER)\\b/',
    implode(' ', array_map(fn (object $grant): string => (string) array_values((array) $grant)[0], $grants)),
);
foreach (['update', 'delete'] as $operation) {
    DB::beginTransaction();
    $rejected = false;
    try {
        $operation === 'update' ? $events->update(['operator_reference' => 'tampered']) : $events->delete();
    } catch (QueryException $exception) {
        // Table privileges now reject the mutation before the trigger runs.
        $rejected = ($exception->errorInfo[1] ?? null) === 1142;
    } finally {
        // A failing security assertion must not destroy its own evidence.
        DB::rollBack();
    }
    $assertions[$operation.'_rejected'] = $rejected;
    $assertions[$operation.'_preserves_history'] = $events->get()->toJson() === $original;
}
echo json_encode($assertions, JSON_THROW_ON_ERROR);
