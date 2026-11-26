<?php

declare(strict_types=1);

use App\Http\Controllers\InventoryController;
use App\Http\Middleware\SessionBoundary;
use App\Http\Middleware\SessionForgeryGuard;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;

Route::middleware([SessionBoundary::class, EncryptCookies::class, StartSession::class, SessionForgeryGuard::class])
    ->prefix('/api/v1/chapters/{chapter_id}')
    ->group(function (): void {
        Route::get('/operations/by-key', [InventoryController::class, 'lookupByKey']);
        Route::get('/operations/by-id/{operation_id}', [InventoryController::class, 'lookupById']);

        Route::prefix('/inventory')->group(function (): void {
            Route::get('/catalog', [InventoryController::class, 'listCatalog']);
            Route::post('/units', [InventoryController::class, 'createUnit']);
            Route::patch('/units/{unit_id}', [InventoryController::class, 'updateUnit']);
            Route::post('/items', [InventoryController::class, 'createItem']);
            Route::post('/items/{item_id}/variants', [InventoryController::class, 'createVariant']);
            Route::post('/items/{item_id}/policy-drafts', [InventoryController::class, 'createItemPolicyDraft']);
            Route::post('/item-policy-versions/{policy_version_id}/approve', [InventoryController::class, 'approveItemPolicyVersion']);
            Route::post('/locations', [InventoryController::class, 'createLocation']);
            Route::post('/custody-assignments', [InventoryController::class, 'assignCustody']);
            Route::post('/restrictions', [InventoryController::class, 'createRestriction']);
            Route::get('/variants/{item_variant_id}/eligibility', [InventoryController::class, 'queryEligibility']);
        });
    });
