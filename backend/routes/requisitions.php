<?php

declare(strict_types=1);

use App\Http\Controllers\RequisitionController;
use App\Http\Middleware\SessionBoundary;
use App\Http\Middleware\SessionForgeryGuard;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;

Route::middleware([SessionBoundary::class, EncryptCookies::class, StartSession::class, SessionForgeryGuard::class])
    ->prefix('/api/v1/chapters/{chapter_id}/requisitions')
    ->group(function (): void {
        Route::get('/', [RequisitionController::class, 'index']);
        Route::get('/form-options', [RequisitionController::class, 'formOptions']);
        Route::post('/drafts', [RequisitionController::class, 'createDraft']);
        Route::get('/{rf_id}', [RequisitionController::class, 'showSummary']);
        Route::get('/{rf_id}/lines-and-clocks', [RequisitionController::class, 'showSummary']);
        Route::get('/{rf_id}/history', [RequisitionController::class, 'showHistory']);
        Route::put('/{rf_id}/draft', [RequisitionController::class, 'replaceDraft']);
        Route::delete('/{rf_id}/draft', [RequisitionController::class, 'discardDraft']);
        Route::post('/{rf_id}/submit', [RequisitionController::class, 'submit']);
        Route::post('/{rf_id}/review', [RequisitionController::class, 'review']);
        Route::post('/{rf_id}/revise', [RequisitionController::class, 'revise']);
        Route::post('/{rf_id}/cancel', [RequisitionController::class, 'cancel']);
        Route::get('/{rf_id}/allocation-proposal', [RequisitionController::class, 'allocationProposal']);
        Route::post('/{rf_id}/reservations/prepare', [RequisitionController::class, 'prepareReservation']);
        Route::post('/{rf_id}/allocate', [RequisitionController::class, 'commitReservation']);
        Route::post('/{rf_id}/reservations/{reservation_id}/release', [RequisitionController::class, 'releaseReservation']);
        Route::post('/{rf_id}/reservations/{reservation_id}/reallocate', [RequisitionController::class, 'reallocateReservation']);
    });
