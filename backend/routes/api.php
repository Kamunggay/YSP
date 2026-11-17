<?php

use App\Http\Controllers\ActualIssueController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BuyerController;
use App\Http\Controllers\CatalogueController;
use App\Http\Controllers\ChapterAccessController;
use App\Http\Controllers\HandoverController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\NotificationSubscriptionController;
use App\Http\Controllers\OpeningInventoryController;
use App\Http\Controllers\PaperEvidenceController;
use App\Http\Controllers\SalesOrderAcceptanceController;
use App\Http\Controllers\SalesOrderController;
use App\Http\Controllers\StockQueryController;
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

    // ================= STOCK QUERIES =================
    Route::get('/stock', [StockQueryController::class, 'listStockSummaries']);
    Route::get('/stock/variants/{variant_id}', [StockQueryController::class, 'readVariantStock']);
    Route::get('/stock/lots', [StockQueryController::class, 'listStockLots']);
    Route::get('/stock/lots/{stock_lot_id}', [StockQueryController::class, 'readStockLot']);
    Route::get('/stock/lots/{stock_lot_id}/eligibility', [StockQueryController::class, 'readStockEligibility']);
    Route::get('/stock/lots/{stock_lot_id}/history', [StockQueryController::class, 'listStockLotHistory']);

    // ================= OPENING INVENTORY (IPC & OPENING RM) =================
    // IPC
    Route::get('/ipcs', [OpeningInventoryController::class, 'listIpcs']);
    Route::post('/ipcs', [OpeningInventoryController::class, 'createIpc']);
    Route::get('/ipcs/{ipc_id}', [OpeningInventoryController::class, 'readIpc']);
    Route::put('/ipcs/{ipc_id}', [OpeningInventoryController::class, 'replaceIpc']);
    Route::put('/ipcs/{ipc_id}/my-count', [OpeningInventoryController::class, 'saveMyIpcCount']);
    Route::post('/ipcs/{ipc_id}/submit', [OpeningInventoryController::class, 'submitIpc']);
    Route::post('/ipcs/{ipc_id}/authorizations', [OpeningInventoryController::class, 'authorizeIpc']);
    Route::get('/ipcs/{ipc_id}/history', [OpeningInventoryController::class, 'listIpcHistory']);
    Route::get('/ipcs/{ipc_id}/versions/{revision}', [OpeningInventoryController::class, 'readIpcRevision']);
    Route::get('/ipcs/{ipc_id}/related', [OpeningInventoryController::class, 'readIpcRelated']);
    Route::get('/ipcs/{ipc_id}/print', [OpeningInventoryController::class, 'printIpc']);

    // Opening RM
    Route::get('/opening-rms', [OpeningInventoryController::class, 'listOpeningRms']);
    Route::post('/opening-rms', [OpeningInventoryController::class, 'createOpeningRm']);
    Route::get('/opening-rms/{rm_id}', [OpeningInventoryController::class, 'readOpeningRm']);
    Route::put('/opening-rms/{rm_id}', [OpeningInventoryController::class, 'replaceOpeningRm']);
    Route::post('/opening-rms/{rm_id}/inspection', [OpeningInventoryController::class, 'inspectOpeningRm']);
    Route::post('/opening-rms/{rm_id}/evidence-match', [OpeningInventoryController::class, 'matchOpeningRmEvidence']);
    Route::post('/opening-rms/{rm_id}/post', [OpeningInventoryController::class, 'postOpeningRm']);
    Route::get('/opening-rms/{rm_id}/movements', [OpeningInventoryController::class, 'listOpeningRmMovements']);
    Route::get('/opening-rms/{rm_id}/findings', [OpeningInventoryController::class, 'listOpeningRmFindings']);
    Route::get('/opening-rms/{rm_id}/history', [OpeningInventoryController::class, 'listOpeningRmHistory']);
    Route::get('/opening-rms/{rm_id}/versions/{revision}', [OpeningInventoryController::class, 'readOpeningRmRevision']);
    Route::get('/opening-rms/{rm_id}/related', [OpeningInventoryController::class, 'readOpeningRmRelated']);
    Route::get('/opening-rms/{rm_id}/print', [OpeningInventoryController::class, 'printOpeningRm']);

    // Baseline & Opening Actions
    Route::get('/opening-baseline', [OpeningInventoryController::class, 'readChapterOpeningBaseline']);
    Route::get('/opening-actions/by-key', [OpeningInventoryController::class, 'findOpeningActionByKey']);
    Route::get('/opening-actions/{operation_id}', [OpeningInventoryController::class, 'readOpeningAction']);
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

    // Day 2 Sales Acceptance & Demand Splitting routes
    Route::post('/sales-orders/{so_id}/contact-logs', [SalesOrderAcceptanceController::class, 'recordCustomerContact']);
    Route::post('/sales-orders/{so_id}/acceptance', [SalesOrderAcceptanceController::class, 'recordBuyerAcceptance']);
    Route::post('/sales-orders/{so_id}/split-demand', [SalesOrderAcceptanceController::class, 'splitDemand']);

    // Handover & Actual Issue routes
    Route::get('/handovers', [HandoverController::class, 'index']);
    Route::post('/handovers', [HandoverController::class, 'store']);
    Route::get('/handovers/{id}', [HandoverController::class, 'show']);
    Route::get('/operations/by-idempotency-key/{key}', [HandoverController::class, 'showByIdempotencyKey']);

    Route::post('/internal-rfs/{rf_id}/actual-issues', [ActualIssueController::class, 'prepare']);
    Route::get('/internal-rfs/{rf_id}/actual-issues', [ActualIssueController::class, 'index']);
    Route::get('/actual-issues/{issue_id}', [ActualIssueController::class, 'show']);
    Route::put('/actual-issues/{issue_id}', [ActualIssueController::class, 'revise']);
    Route::get('/actual-issues/{issue_id}/print', [ActualIssueController::class, 'print']);
    Route::post('/actual-issues/{issue_id}/acknowledgments', [ActualIssueController::class, 'matchAcknowledgment']);
    Route::post('/actual-issues/{issue_id}/post', [ActualIssueController::class, 'post']);
    Route::get('/actual-issues/{issue_id}/history', [ActualIssueController::class, 'history']);
    Route::get('/actual-issues/{issue_id}/movements', [ActualIssueController::class, 'movements']);
    Route::get('/actual-issues/{issue_id}/related', [ActualIssueController::class, 'related']);
    Route::post('/actual-issues/{issue_id}/reconciliations', [ActualIssueController::class, 'reconciliations']);
    Route::get('/actual-issues/{issue_id}/reconciliation', [ActualIssueController::class, 'showReconciliation']);
    Route::get('/actual-issue-operations/by-key', [ActualIssueController::class, 'operationsByKey']);
    Route::get('/actual-issue-operations/{operation_id}', [ActualIssueController::class, 'operationsById']);
});

// Global Handover & Operations routes (Stage 3/4 proposal endpoints per DELIVERY-INTEGRATION-CONTRACT.md)
Route::prefix('v1')->group(function () {
    Route::post('/handovers', [HandoverController::class, 'store']);
    Route::get('/handovers', [HandoverController::class, 'index']);
    Route::get('/handovers/{id}', [HandoverController::class, 'show']);
    Route::get('/operations/by-idempotency-key/{key}', [HandoverController::class, 'showByIdempotencyKey']);
});
