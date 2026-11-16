<?php

use App\Http\Controllers\BuyerController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\SalesOrderController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::prefix('v1/chapters/{chapter_id}')->group(function () {
    Route::get('/buyers', [BuyerController::class, 'index']);
    Route::post('/buyers', [BuyerController::class, 'store']);

    Route::get('/sales-orders', [SalesOrderController::class, 'index']);
    Route::post('/sales-orders', [SalesOrderController::class, 'store']);
    Route::get('/sales-orders/{id}', [SalesOrderController::class, 'show']);
    Route::post('/sales-orders/{id}/submit', [SalesOrderController::class, 'submit']);
    Route::post('/sales-orders/{id}/review', [SalesOrderController::class, 'review']);
    Route::post('/sales-orders/{id}/revise', [SalesOrderController::class, 'revise']);
    Route::post('/sales-orders/{id}/cancel', [SalesOrderController::class, 'cancel']);
});
