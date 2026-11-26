<?php

declare(strict_types=1);

use App\Http\Controllers\SalesOrderController;
use App\Http\Middleware\SessionBoundary;
use App\Http\Middleware\SessionForgeryGuard;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;

Route::middleware([SessionBoundary::class, EncryptCookies::class, StartSession::class, SessionForgeryGuard::class])
    ->prefix('/api/v1/chapters/{chapter_id}/sales')
    ->group(function (): void {
        Route::get('/', [SalesOrderController::class, 'index']);
        Route::post('/pools', [SalesOrderController::class, 'configurePool']);
        Route::post('/orders', [SalesOrderController::class, 'createDraft']);
        Route::post('/orders/{so_id}/submit', [SalesOrderController::class, 'submit']);
        Route::post('/orders/{so_id}/approve', [SalesOrderController::class, 'approve']);
        Route::post('/orders/{so_id}/return', [SalesOrderController::class, 'returnOrder']);
        Route::post('/orders/{so_id}/revise', [SalesOrderController::class, 'revise']);
        Route::post('/orders/{so_id}/cancel', [SalesOrderController::class, 'cancel']);
        Route::post('/orders/{so_id}/split', [SalesOrderController::class, 'split']);
        Route::post('/orders/{so_id}/buyer-acceptance', [SalesOrderController::class, 'buyerAcceptance']);
        Route::post('/orders/{so_id}/invoice', [SalesOrderController::class, 'issueInvoice']);
        Route::post('/orders/{so_id}/approve-excess-cost', [SalesOrderController::class, 'approveExcessCost']);
        Route::post('/orders/{so_id}/funding', [SalesOrderController::class, 'recordFunding']);
        Route::post('/orders/{so_id}/evaluate-clocks', [SalesOrderController::class, 'evaluateClocks']);
        Route::post('/orders/{so_id}/forward-repf', [SalesOrderController::class, 'forwardRepf']);
        Route::post('/orders/{so_id}/resolve-late-payment', [SalesOrderController::class, 'resolveLatePayment']);
    });
