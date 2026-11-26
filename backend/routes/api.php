<?php

use App\Http\Controllers\ActualIssueController;
use App\Http\Controllers\BrowserSessionController;
use App\Http\Controllers\BuyerController;
use App\Http\Controllers\CatalogueController;
use App\Http\Controllers\ChapterAccessController;
use App\Http\Controllers\HandoverController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\InternalRfController;
use App\Http\Controllers\NotificationSubscriptionController;
use App\Http\Controllers\OpeningInventoryController;
use App\Http\Controllers\PaperEvidenceController;
use App\Http\Controllers\ReservationAndHoldController;
use App\Http\Controllers\SalesOrderAcceptanceController;
use App\Http\Controllers\SalesOrderController;
use App\Http\Controllers\StockQueryController;
use App\Http\PaperEvidenceDownload;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

// ================= AUTH & SESSION (13 endpoints) =================
Route::prefix('v1/auth')->group(function () {
    Route::get('/csrf', [BrowserSessionController::class, 'csrf']);
    Route::post('/sign-in', [BrowserSessionController::class, 'signIn']);
    Route::get('/session', [BrowserSessionController::class, 'session']);
    Route::post('/sign-out', [BrowserSessionController::class, 'signOut']);
    Route::post('/authenticator/enrollments', [BrowserSessionController::class, 'beginEnrollment']);
    Route::post('/authenticator/enrollments/confirm', [BrowserSessionController::class, 'confirmEnrollment']);
    Route::post('/authenticator/challenge', [BrowserSessionController::class, 'completeAuthenticatorChallenge']);
    Route::post('/recovery/challenge', [BrowserSessionController::class, 'completeRecoveryChallenge']);
    Route::get('/recovery-codes', [BrowserSessionController::class, 'recoveryCodes']);
    Route::post('/recovery-codes/rotate', [BrowserSessionController::class, 'rotateRecoveryCodes']);
    Route::get('/memberships', [ChapterAccessController::class, 'memberships'])->middleware('browser.authority:reads');
    Route::post('/notification-subscriptions/authorize', [NotificationSubscriptionController::class, 'authorizeSession'])->middleware('browser.authority');
});

// ================= SECURED CHAPTER CONTEXT =================
Route::prefix('v1/chapters/{chapter_id}')->middleware('browser.authority:reads', 'stage-one.chapter')->group(function () {
    Route::get('/context', [ChapterAccessController::class, 'context']);
    Route::get('/access', [ChapterAccessController::class, 'access']);
});

Route::prefix('v1/chapters/{chapter_id}')->middleware('browser.authority:evidence', 'stage-one.chapter')->group(function () {
    Route::post('/evidence', [PaperEvidenceController::class, 'upload'])->middleware('stage-one.action:evidence.prepare');
    Route::get('/evidence/{evidence_id}', [PaperEvidenceController::class, 'show'])->middleware('stage-one.action:evidence.read');
    Route::get('/evidence/{evidence_id}/versions', [PaperEvidenceController::class, 'versions'])->middleware('stage-one.action:evidence.read,history.read');
    Route::post('/evidence/{evidence_id}/versions', [PaperEvidenceController::class, 'upload'])->middleware('stage-one.action:evidence.prepare')->name('paper-evidence.replace');
    Route::get('/evidence/{evidence_id}/versions/{version_id}', [PaperEvidenceController::class, 'showVersion'])->middleware('stage-one.action:evidence.read,history.read');
    Route::get('/evidence/{evidence_id}/versions/{version_id}/attachments/{attachment_id}/content', [PaperEvidenceController::class, 'retrieveAttachment'])
        ->middleware('stage-one.action:'.implode(',', PaperEvidenceDownload::ACTIONS));
});

Route::prefix('v1/chapters/{chapter_id}')->middleware('browser.authority', 'stage-one.chapter')->group(function () {
    Route::post('/notification-subscriptions/authorize', [NotificationSubscriptionController::class, 'authorizeChapter']);

    // Catalogue Operations (static paths before dynamic {operation_id})
    Route::get('/catalogue/operations/by-key', [CatalogueController::class, 'findOperationByKey'])->middleware('stage-one.action:catalogue.maintain');
    Route::get('/catalogue/operations/{operation_id}', [CatalogueController::class, 'readOperation'])->middleware('stage-one.action:catalogue.maintain');

    // Catalogue Read
    Route::get('/catalogue/items', [CatalogueController::class, 'listItems'])->middleware('stage-one.action:catalogue.read');
    Route::get('/catalogue/items/{resource_id}', [CatalogueController::class, 'readItem'])->middleware('stage-one.action:catalogue.read');
    Route::get('/catalogue/items/{resource_id}/history', [CatalogueController::class, 'listItemHistory'])->middleware('stage-one.action:history.read,catalogue.read');
    Route::get('/catalogue/items/{resource_id}/versions/{material_version}', [CatalogueController::class, 'readItemVersion'])->middleware('stage-one.action:history.read,catalogue.read');

    Route::get('/catalogue/variants', [CatalogueController::class, 'listVariants'])->middleware('stage-one.action:catalogue.read');
    Route::get('/catalogue/variants/{resource_id}', [CatalogueController::class, 'readVariant'])->middleware('stage-one.action:catalogue.read');
    Route::get('/catalogue/variants/{resource_id}/history', [CatalogueController::class, 'listVariantHistory'])->middleware('stage-one.action:history.read,catalogue.read');
    Route::get('/catalogue/variants/{resource_id}/versions/{material_version}', [CatalogueController::class, 'readVariantVersion'])->middleware('stage-one.action:history.read,catalogue.read');

    Route::get('/catalogue/units', [CatalogueController::class, 'listUnits'])->middleware('stage-one.action:catalogue.read');
    Route::get('/catalogue/units/{resource_id}', [CatalogueController::class, 'readUnit'])->middleware('stage-one.action:catalogue.read');
    Route::get('/catalogue/units/{resource_id}/history', [CatalogueController::class, 'listUnitHistory'])->middleware('stage-one.action:history.read,catalogue.read');
    Route::get('/catalogue/units/{resource_id}/versions/{material_version}', [CatalogueController::class, 'readUnitVersion'])->middleware('stage-one.action:history.read,catalogue.read');

    Route::get('/catalogue/locations', [CatalogueController::class, 'listLocations'])->middleware('stage-one.action:catalogue.read');
    Route::get('/catalogue/locations/{resource_id}', [CatalogueController::class, 'readLocation'])->middleware('stage-one.action:catalogue.read');
    Route::get('/catalogue/locations/{resource_id}/history', [CatalogueController::class, 'listLocationHistory'])->middleware('stage-one.action:history.read,catalogue.read');
    Route::get('/catalogue/locations/{resource_id}/versions/{material_version}', [CatalogueController::class, 'readLocationVersion'])->middleware('stage-one.action:history.read,catalogue.read');

    // Catalogue writes
    Route::post('/catalogue/items', [CatalogueController::class, 'createItem'])->middleware('stage-one.action:catalogue.maintain', 'idempotent');
    Route::put('/catalogue/items/{resource_id}', [CatalogueController::class, 'replaceItem'])->middleware('stage-one.action:catalogue.maintain', 'idempotent');

    Route::post('/catalogue/variants', [CatalogueController::class, 'createVariant'])->middleware('stage-one.action:catalogue.maintain', 'idempotent');
    Route::put('/catalogue/variants/{resource_id}', [CatalogueController::class, 'replaceVariant'])->middleware('stage-one.action:catalogue.maintain', 'idempotent');

    Route::post('/catalogue/units', [CatalogueController::class, 'createUnit'])->middleware('stage-one.action:catalogue.maintain', 'idempotent');
    Route::put('/catalogue/units/{resource_id}', [CatalogueController::class, 'replaceUnit'])->middleware('stage-one.action:catalogue.maintain', 'idempotent');

    Route::post('/catalogue/locations', [CatalogueController::class, 'createLocation'])->middleware('stage-one.action:catalogue.maintain', 'idempotent');
    Route::put('/catalogue/locations/{resource_id}', [CatalogueController::class, 'replaceLocation'])->middleware('stage-one.action:catalogue.maintain', 'idempotent');

    // ================= STOCK QUERIES =================
    Route::get('/stock', [StockQueryController::class, 'listStockSummaries'])->middleware('stage-one.action:stock.read');
    Route::get('/stock/variants/{variant_id}', [StockQueryController::class, 'readVariantStock'])->middleware('stage-one.action:stock.read');
    Route::get('/stock/lots', [StockQueryController::class, 'listStockLots'])->middleware('stage-one.action:stock.read');
    Route::get('/stock/lots/{stock_lot_id}', [StockQueryController::class, 'readStockLot'])->middleware('stage-one.action:stock.read');
    Route::get('/stock/lots/{stock_lot_id}/eligibility', [StockQueryController::class, 'readStockEligibility'])->middleware('stage-one.action:stock.read');
    Route::get('/stock/lots/{stock_lot_id}/history', [StockQueryController::class, 'listStockLotHistory'])->middleware('stage-one.action:history.read,stock.read');

    // ================= OPENING INVENTORY (IPC & OPENING RM) =================
    Route::get('/opening-actions/by-key', [OpeningInventoryController::class, 'findOpeningActionByKey'])->middleware('stage-one.action:opening.result.read');
    Route::get('/opening-actions/{operation_id}', [OpeningInventoryController::class, 'readOpeningAction'])->middleware('stage-one.action:opening.result.read');
    Route::get('/opening-baseline', [OpeningInventoryController::class, 'readChapterOpeningBaseline'])->middleware('stage-one.action:stock.read');

    // IPC
    Route::get('/ipcs', [OpeningInventoryController::class, 'listIpcs'])->middleware('stage-one.action:ipc.read');
    Route::post('/ipcs', [OpeningInventoryController::class, 'createIpc'])->middleware('stage-one.action:ipc.draft', 'idempotent');
    Route::get('/ipcs/{ipc_id}', [OpeningInventoryController::class, 'readIpc'])->middleware('stage-one.action:ipc.read');
    Route::put('/ipcs/{ipc_id}', [OpeningInventoryController::class, 'replaceIpc'])->middleware('stage-one.action:ipc.draft', 'idempotent');
    Route::put('/ipcs/{ipc_id}/my-count', [OpeningInventoryController::class, 'saveMyIpcCount'])->middleware('stage-one.action:ipc.count', 'idempotent');
    Route::post('/ipcs/{ipc_id}/submit', [OpeningInventoryController::class, 'submitIpc'])->middleware('stage-one.action:ipc.draft', 'idempotent');
    Route::post('/ipcs/{ipc_id}/authorizations', [OpeningInventoryController::class, 'authorizeIpc'])->middleware('stage-one.action:ipc.authorize', 'idempotent');
    Route::get('/ipcs/{ipc_id}/history', [OpeningInventoryController::class, 'listIpcHistory'])->middleware('stage-one.action:ipc.read,history.read');
    Route::get('/ipcs/{ipc_id}/versions/{revision}', [OpeningInventoryController::class, 'readIpcRevision'])->middleware('stage-one.action:ipc.read,history.read');
    Route::get('/ipcs/{ipc_id}/related', [OpeningInventoryController::class, 'readIpcRelated'])->middleware('stage-one.action:ipc.read,history.read');
    Route::get('/ipcs/{ipc_id}/print', [OpeningInventoryController::class, 'printIpc'])->middleware('stage-one.action:ipc.read');

    // Opening RM
    Route::get('/opening-rms', [OpeningInventoryController::class, 'listOpeningRms'])->middleware('stage-one.action:opening_rm.read');
    Route::post('/opening-rms', [OpeningInventoryController::class, 'createOpeningRm'])->middleware('stage-one.action:opening_rm.prepare', 'idempotent');
    Route::get('/opening-rms/{rm_id}', [OpeningInventoryController::class, 'readOpeningRm'])->middleware('stage-one.action:opening_rm.read');
    Route::put('/opening-rms/{rm_id}', [OpeningInventoryController::class, 'replaceOpeningRm'])->middleware('stage-one.action:opening_rm.prepare', 'idempotent');
    Route::post('/opening-rms/{rm_id}/inspection', [OpeningInventoryController::class, 'inspectOpeningRm'])->middleware('stage-one.action:opening_rm.prepare', 'idempotent');
    Route::post('/opening-rms/{rm_id}/evidence-match', [OpeningInventoryController::class, 'matchOpeningRmEvidence'])->middleware('stage-one.action:opening_rm.prepare', 'idempotent');
    Route::post('/opening-rms/{rm_id}/post', [OpeningInventoryController::class, 'postOpeningRm'])->middleware('stage-one.action:opening_rm.post', 'idempotent');
    Route::get('/opening-rms/{rm_id}/movements', [OpeningInventoryController::class, 'listOpeningRmMovements'])->middleware('stage-one.action:stock.read');
    Route::get('/opening-rms/{rm_id}/findings', [OpeningInventoryController::class, 'listOpeningRmFindings'])->middleware('stage-one.action:stock.read');
    Route::get('/opening-rms/{rm_id}/history', [OpeningInventoryController::class, 'listOpeningRmHistory'])->middleware('stage-one.action:opening_rm.read,history.read');
    Route::get('/opening-rms/{rm_id}/versions/{revision}', [OpeningInventoryController::class, 'readOpeningRmRevision'])->middleware('stage-one.action:opening_rm.read,history.read');
    Route::get('/opening-rms/{rm_id}/related', [OpeningInventoryController::class, 'readOpeningRmRelated'])->middleware('stage-one.action:opening_rm.read,history.read');
    Route::get('/opening-rms/{rm_id}/print', [OpeningInventoryController::class, 'printOpeningRm'])->middleware('stage-one.action:opening_rm.read');

    // ================= INTERNAL RFS (TICKET 06 - 14 endpoints) =================
    // Static operation-results routes BEFORE dynamic {rf_id}
    Route::get('/internal-rfs/operation-results', [InternalRfController::class, 'findInternalRfOperationResult'])->middleware('stage-one.action:rf.read');
    Route::get('/internal-rfs/operation-results/{operation_id}', [InternalRfController::class, 'readInternalRfOperationResult'])->middleware('stage-one.action:rf.read');
    Route::get('/internal-rfs', [InternalRfController::class, 'listInternalRfs'])->middleware('stage-one.action:rf.read');
    Route::get('/internal-rfs/{rf_id}', [InternalRfController::class, 'readInternalRf'])->middleware('stage-one.action:rf.read');
    Route::get('/internal-rfs/{rf_id}/history', [InternalRfController::class, 'listInternalRfHistory'])->middleware('stage-one.action:rf.read,history.read');
    Route::get('/internal-rfs/{rf_id}/versions/{version}', [InternalRfController::class, 'readInternalRfVersion'])->middleware('stage-one.action:rf.read,history.read');
    Route::get('/internal-rfs/{rf_id}/related-records', [InternalRfController::class, 'listInternalRfRelatedRecords'])->middleware('stage-one.action:rf.read,history.read');

    Route::post('/internal-rfs', [InternalRfController::class, 'createInternalRf'])->middleware('stage-one.action:rf.draft', 'idempotent');
    Route::put('/internal-rfs/{rf_id}', [InternalRfController::class, 'replaceInternalRfDraft'])->middleware('stage-one.action:rf.draft', 'idempotent');
    Route::post('/internal-rfs/{rf_id}/submit', [InternalRfController::class, 'submitInternalRf'])->middleware('stage-one.action:rf.submit', 'idempotent');
    Route::post('/internal-rfs/{rf_id}/revise', [InternalRfController::class, 'reviseInternalRf'])->middleware('stage-one.action:rf.draft', 'idempotent');
    Route::post('/internal-rfs/{rf_id}/cancel', [InternalRfController::class, 'cancelInternalRf'])->middleware('stage-one.action:rf.draft', 'idempotent');

    Route::post('/internal-rfs/{rf_id}/approve', [InternalRfController::class, 'approveInternalRf'])->middleware('stage-one.action:rf.approve', 'idempotent');
    Route::post('/internal-rfs/{rf_id}/return', [InternalRfController::class, 'returnInternalRf'])->middleware('stage-one.action:rf.approve', 'idempotent');

    // ================= RESERVATIONS & STOCK HOLDS (TICKET 07 - 17 endpoints) =================
    // Static reservation-operations/by-key BEFORE {operation_id}
    Route::get('/reservation-operations/by-key', [ReservationAndHoldController::class, 'findReservationOperation'])->middleware('stage-one.action:stock.read');
    Route::get('/reservation-operations/{operation_id}', [ReservationAndHoldController::class, 'readReservationOperation'])->middleware('stage-one.action:stock.read');
    Route::get('/internal-rfs/{rf_id}/reservation-preparations/{preparation_id}', [ReservationAndHoldController::class, 'readRfReservationPreparation'])->middleware('stage-one.action:rf.reserve,rf.read,stock.read');
    Route::get('/internal-rfs/{rf_id}/reservations', [ReservationAndHoldController::class, 'listRfReservations'])->middleware('stage-one.action:rf.read,stock.read');
    Route::get('/internal-rfs/{rf_id}/reservations/{reservation_id}', [ReservationAndHoldController::class, 'readRfReservation'])->middleware('stage-one.action:rf.read,stock.read');
    Route::get('/internal-rfs/{rf_id}/reservations/{reservation_id}/history', [ReservationAndHoldController::class, 'listRfReservationHistory'])->middleware('stage-one.action:history.read,rf.read,stock.read');
    Route::get('/internal-rfs/{rf_id}/allocation-review', [ReservationAndHoldController::class, 'readRfAllocationReview'])->middleware('stage-one.action:rf.read,stock.read');
    Route::get('/stock-holds', [ReservationAndHoldController::class, 'listStockHolds'])->middleware('stage-one.action:stock.read');
    Route::get('/stock-holds/{hold_id}', [ReservationAndHoldController::class, 'readStockHold'])->middleware('stage-one.action:stock.read');
    Route::get('/stock-holds/{hold_id}/history', [ReservationAndHoldController::class, 'listStockHoldHistory'])->middleware('stage-one.action:history.read,stock.read');

    Route::post('/internal-rfs/{rf_id}/reservation-preparations', [ReservationAndHoldController::class, 'prepareRfReservation'])->middleware('stage-one.action:rf.reserve,rf.read,stock.read', 'idempotent');
    Route::post('/internal-rfs/{rf_id}/reservation-preparations/{preparation_id}/commit', [ReservationAndHoldController::class, 'commitRfReservation'])->middleware('stage-one.action:rf.reserve,rf.read,stock.read', 'idempotent');
    Route::post('/internal-rfs/{rf_id}/reservations/{reservation_id}/release', [ReservationAndHoldController::class, 'releaseRfReservation'])->middleware('stage-one.action:rf.reserve,rf.read,stock.read', 'idempotent');
    Route::post('/internal-rfs/{rf_id}/reservations/{reservation_id}/reallocate', [ReservationAndHoldController::class, 'reallocateRfReservation'])->middleware('stage-one.action:rf.reallocate,rf.read,stock.read', 'idempotent');
    Route::post('/stock-holds', [ReservationAndHoldController::class, 'placeStockHold'])->middleware('stage-one.action:hold.place,stock.read', 'idempotent');
    Route::put('/stock-holds/{hold_id}/clearance-proposal', [ReservationAndHoldController::class, 'proposeStockHoldClearance'])->middleware('stage-one.action:hold.clear,stock.read', 'idempotent');
    Route::post('/stock-holds/{hold_id}/clear', [ReservationAndHoldController::class, 'clearStockHold'])->middleware('stage-one.action:hold.clear,evidence.read,stock.read', 'idempotent');

    // ================= ACTUAL ISSUES (TICKET 08 - 14 endpoints) =================
    // Static actual-issue-operations/by-key BEFORE {operation_id}
    Route::get('/actual-issue-operations/by-key', [ActualIssueController::class, 'operationsByKey'])->middleware('stage-one.action:issue.prepare,rf.read,stock.read,evidence.read');
    Route::get('/actual-issue-operations/{operation_id}', [ActualIssueController::class, 'operationsById'])->middleware('stage-one.action:issue.prepare,rf.read,stock.read,evidence.read');
    Route::get('/internal-rfs/{rf_id}/actual-issues', [ActualIssueController::class, 'index'])->middleware('stage-one.action:issue.prepare,rf.read,stock.read,evidence.read');
    Route::get('/actual-issues/{issue_id}', [ActualIssueController::class, 'show'])->middleware('stage-one.action:issue.prepare,rf.read,stock.read,evidence.read');
    Route::get('/actual-issues/{issue_id}/print', [ActualIssueController::class, 'print'])->middleware('stage-one.action:issue.prepare,rf.read,stock.read,evidence.read');
    Route::get('/actual-issues/{issue_id}/history', [ActualIssueController::class, 'history'])->middleware('stage-one.action:history.read,rf.read,stock.read,issue.prepare,evidence.read');
    Route::get('/actual-issues/{issue_id}/movements', [ActualIssueController::class, 'movements'])->middleware('stage-one.action:stock.read,rf.read,issue.prepare,evidence.read');
    Route::get('/actual-issues/{issue_id}/related', [ActualIssueController::class, 'related'])->middleware('stage-one.action:issue.prepare,rf.read,stock.read,evidence.read');
    Route::get('/actual-issues/{issue_id}/reconciliation', [ActualIssueController::class, 'showReconciliation'])->middleware('stage-one.action:issue.post,rf.read,stock.read,evidence.read');

    Route::post('/internal-rfs/{rf_id}/actual-issues', [ActualIssueController::class, 'prepare'])->middleware('stage-one.action:issue.prepare,rf.read,stock.read,evidence.read', 'idempotent');
    Route::put('/actual-issues/{issue_id}', [ActualIssueController::class, 'revise'])->middleware('stage-one.action:issue.prepare,rf.read,stock.read,evidence.read', 'idempotent');
    Route::post('/actual-issues/{issue_id}/acknowledgments', [ActualIssueController::class, 'matchAcknowledgment'])->middleware('stage-one.action:issue.prepare,rf.read,stock.read,evidence.read,issue.post', 'idempotent');
    Route::post('/actual-issues/{issue_id}/post', [ActualIssueController::class, 'post'])->middleware('stage-one.action:issue.post,rf.read,stock.read,evidence.read', 'idempotent');
    Route::post('/actual-issues/{issue_id}/reconciliations', [ActualIssueController::class, 'reconciliations'])->middleware('stage-one.action:issue.post,rf.read,stock.read,evidence.read', 'idempotent');

});

Route::prefix('v1/chapters/{chapter_id}')->middleware('chapter.context')->group(function () {
    // ================= SALES ORDERS & BUYERS (Stage 1A/1B) =================
    Route::get('/buyers', [BuyerController::class, 'index']);
    Route::post('/buyers', [BuyerController::class, 'store'])->middleware(['duty.authority:SALES_OFFICER,SALES_REVIEWER,INVENTORY_CUSTODIAN', 'idempotent']);

    Route::get('/sales-orders', [SalesOrderController::class, 'index']);
    Route::get('/sales-orders/{id}', [SalesOrderController::class, 'show']);
    Route::get('/sales-orders/{id}/print', [SalesOrderController::class, 'print']);

    Route::middleware(['duty.authority:SALES_OFFICER,SALES_REVIEWER,INVENTORY_CUSTODIAN', 'idempotent'])->group(function () {
        Route::post('/sales-orders', [SalesOrderController::class, 'store']);
        Route::post('/sales-orders/{id}/submit', [SalesOrderController::class, 'submit']);
        Route::post('/sales-orders/{id}/review', [SalesOrderController::class, 'review']);
        Route::post('/sales-orders/{id}/revise', [SalesOrderController::class, 'revise']);
        Route::post('/sales-orders/{id}/cancel', [SalesOrderController::class, 'cancel']);

        Route::post('/sales-orders/{so_id}/contact-logs', [SalesOrderAcceptanceController::class, 'recordCustomerContact']);
        Route::post('/sales-orders/{so_id}/acceptance', [SalesOrderAcceptanceController::class, 'recordBuyerAcceptance']);
        Route::post('/sales-orders/{so_id}/split-demand', [SalesOrderAcceptanceController::class, 'splitDemand']);
    });

    // ================= CHAPTER-SCOPED HANDOVERS =================
    Route::get('/handovers', [HandoverController::class, 'index']);
    Route::post('/handovers', [HandoverController::class, 'store'])->middleware(['duty.authority:INVENTORY,DISPATCH,INVENTORY_CUSTODIAN,SALES_OFFICER', 'idempotent']);
    Route::get('/handovers/{id}', [HandoverController::class, 'show']);
    Route::get('/operations/by-idempotency-key/{key}', [HandoverController::class, 'showByIdempotencyKey']);
});

// Global Handover & Operations routes (Stage 3/4 proposal endpoints per DELIVERY-INTEGRATION-CONTRACT.md)
Route::prefix('v1')->group(function () {
    Route::post('/handovers', [HandoverController::class, 'store']);
    Route::get('/handovers', [HandoverController::class, 'index']);
    Route::get('/handovers/{id}', [HandoverController::class, 'show']);
    Route::get('/operations/by-idempotency-key/{key}', [HandoverController::class, 'showByIdempotencyKey']);
});
