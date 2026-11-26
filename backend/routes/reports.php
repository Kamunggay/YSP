<?php

declare(strict_types=1);

use App\Http\Controllers\ReportsAndMapController;
use App\Http\Middleware\SessionBoundary;
use App\Http\Middleware\SessionForgeryGuard;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;

Route::middleware([SessionBoundary::class, EncryptCookies::class, StartSession::class, SessionForgeryGuard::class])
    ->prefix('/api/v1/chapters/{chapter_id}')
    ->group(function (): void {
        Route::get('/reports/stock-views', [ReportsAndMapController::class, 'stockViews']);
        Route::get('/reports/workspace', [ReportsAndMapController::class, 'workspace']);
        Route::post('/reports/alerts', [ReportsAndMapController::class, 'enqueueAlert']);
        Route::post('/reports/generate', [ReportsAndMapController::class, 'generateReport']);
        Route::post('/reports/jobs/{job_id}/retry', [ReportsAndMapController::class, 'retryReport']);

        Route::get('/operations-map', [ReportsAndMapController::class, 'getMap']);
        Route::post('/operations-map/view', [ReportsAndMapController::class, 'selectView']);
        Route::post('/operations-map/text-alternative', [ReportsAndMapController::class, 'toggleTextAlternative']);
        Route::post('/operations-map/failure-mode', [ReportsAndMapController::class, 'setFailureMode']);
        Route::get('/operations-map/diagram', [ReportsAndMapController::class, 'renderDiagram']);
        Route::get('/operations-map/nodes/{node_code}', [ReportsAndMapController::class, 'inspectNode']);
    });
