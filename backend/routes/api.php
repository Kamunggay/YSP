<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BuyerController;
use App\Http\Controllers\CatalogueController;
use App\Http\Controllers\ChapterAccessController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\NotificationSubscriptionController;
use App\Http\Controllers\PaperEvidenceController;
use App\Http\Controllers\SalesOrderController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

// ================= AUTH & SESSION (13 endpoints) =================
Route::prefix('v1/auth')->group(function () {
    Route::get('/csrf', [AuthController::class, 'csrf']);
    Route::post('/sign-in', [AuthController::class, 'signIn']);
    Route::get('/session', [AuthController::class, 'session']);
    Route::post('/sign-out', [AuthController::class, 'signOut']);
    Route::post('/authenticator/enrollments', [AuthController::class, 'beginEnrollment']);
    Route::post('/authenticator/enrollments/confirm', [AuthController::class, 'confirmEnrollment']);
    Route::post('/authenticator/challenge', [AuthController::class, 'completeAuthenticatorChallenge']);
    Route::post('/recovery/challenge', [AuthController::class, 'completeRecoveryChallenge']);
    Route::get('/recovery-codes', [AuthController::class, 'recoveryCodes']);
    Route::post('/recovery-codes/rotate', [AuthController::class, 'rotateRecoveryCodes']);
    Route::get('/memberships', [AuthController::class, 'memberships']);
    Route::post('/notification-subscriptions/authorize', [NotificationSubscriptionController::class, 'authorizeSession']);
});

// ================= CHAPTER CONTEXT =================
Route::prefix('v1/chapters/{chapter_id}')->middleware(['chapter.context'])->group(function () {
    // Context & Access
    Route::get('/context', [ChapterAccessController::class, 'context']);
    Route::get('/access', [ChapterAccessController::class, 'access']);
    Route::post('/notification-subscriptions/authorize', [NotificationSubscriptionController::class, 'authorizeChapter']);

    // Evidence
    Route::post('/evidence', [PaperEvidenceController::class, 'upload'])->middleware(['idempotent']);
    Route::get('/evidence/{evidence_id}', [PaperEvidenceController::class, 'show']);
    Route::get('/evidence/{evidence_id}/versions', [PaperEvidenceController::class, 'versions']);
    Route::post('/evidence/{evidence_id}/versions', [PaperEvidenceController::class, 'replace'])->middleware(['idempotent']);
    Route::get('/evidence/{evidence_id}/versions/{version_id}', [PaperEvidenceController::class, 'showVersion']);
    Route::get('/evidence/{evidence_id}/versions/{version_id}/attachments/{attachment_id}/content', [PaperEvidenceController::class, 'retrieveAttachment']);

    // Catalogue Read
    Route::get('/catalogue/items', [CatalogueController::class, 'listItems']);
    Route::get('/catalogue/items/{resource_id}', [CatalogueController::class, 'readItem']);
    Route::get('/catalogue/items/{resource_id}/history', [CatalogueController::class, 'listItemHistory']);
    Route::get('/catalogue/items/{resource_id}/versions/{material_version}', [CatalogueController::class, 'readItemVersion']);

    Route::get('/catalogue/variants', [CatalogueController::class, 'listVariants']);
    Route::get('/catalogue/variants/{resource_id}', [CatalogueController::class, 'readVariant']);
    Route::get('/catalogue/variants/{resource_id}/history', [CatalogueController::class, 'listVariantHistory']);
    Route::get('/catalogue/variants/{resource_id}/versions/{material_version}', [CatalogueController::class, 'readVariantVersion']);

    Route::get('/catalogue/units', [CatalogueController::class, 'listUnits']);
    Route::get('/catalogue/units/{resource_id}', [CatalogueController::class, 'readUnit']);
    Route::get('/catalogue/units/{resource_id}/history', [CatalogueController::class, 'listUnitHistory']);
    Route::get('/catalogue/units/{resource_id}/versions/{material_version}', [CatalogueController::class, 'readUnitVersion']);

    Route::get('/catalogue/locations', [CatalogueController::class, 'listLocations']);
    Route::get('/catalogue/locations/{resource_id}', [CatalogueController::class, 'readLocation']);
    Route::get('/catalogue/locations/{resource_id}/history', [CatalogueController::class, 'listLocationHistory']);
    Route::get('/catalogue/locations/{resource_id}/versions/{material_version}', [CatalogueController::class, 'readLocationVersion']);

    Route::get('/catalogue/operations/by-key', [CatalogueController::class, 'findOperationByKey']);
    Route::get('/catalogue/operations/{operation_id}', [CatalogueController::class, 'readOperation']);

    // Catalogue Write (requires duty authority & idempotent)
    Route::middleware(['duty.authority:INVENTORY,INVENTORY_CUSTODIAN', 'idempotent'])->group(function () {
        Route::post('/catalogue/items', [CatalogueController::class, 'createItem']);
        Route::put('/catalogue/items/{resource_id}', [CatalogueController::class, 'replaceItem']);

        Route::post('/catalogue/variants', [CatalogueController::class, 'createVariant']);
        Route::put('/catalogue/variants/{resource_id}', [CatalogueController::class, 'replaceVariant']);

        Route::post('/catalogue/units', [CatalogueController::class, 'createUnit']);
        Route::put('/catalogue/units/{resource_id}', [CatalogueController::class, 'replaceUnit']);

        Route::post('/catalogue/locations', [CatalogueController::class, 'createLocation']);
        Route::put('/catalogue/locations/{resource_id}', [CatalogueController::class, 'replaceLocation']);
    });
});

// Sales Order & Buyer routes (without chapter context enforcement)
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
