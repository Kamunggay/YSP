<?php

declare(strict_types=1);

foreach (['app', 'bootstrap', 'config', 'database', 'routes', 'scripts', 'tests', 'public'] as $directory) {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory));
    foreach ($files as $file) {
        if ($file->isFile() && $file->getExtension() === 'php') {
            passthru(PHP_BINARY.' -l '.escapeshellarg($file->getPathname()), $status);
            if ($status !== 0) {
                exit($status);
            }
        }
    }
}
