<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

if (getenv('YSP_SESSION_FIXTURES') !== '1') {
    exit(1);
}
require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
DB::beginTransaction();
try {
    DB::table('session_throttles')->orderBy('key')->lockForUpdate()->get();
    echo "held\n";
    fflush(STDOUT);
    fgets(STDIN);
} finally {
    DB::rollBack();
}
