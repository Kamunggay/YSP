<?php

declare(strict_types=1);

use App\Http\Controllers\SessionController;
use App\Http\Middleware\SessionBoundary;
use App\Http\Middleware\SessionForgeryGuard;
use App\Modules\AccessChapterAdministration\SessionContract;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;

Route::middleware([SessionBoundary::class, EncryptCookies::class, StartSession::class, SessionForgeryGuard::class])
    ->group(function (): void {
        $operations = app(SessionContract::class)->metadata()['operations'];
        Route::match([$operations['initializeCsrf']['method']], $operations['initializeCsrf']['path'], fn () => response()->noContent());
        Route::match([$operations['signIn']['method']], $operations['signIn']['path'], [SessionController::class, 'signIn']);
        Route::match([$operations['getSession']['method']], $operations['getSession']['path'], [SessionController::class, 'getSession']);
        Route::match([$operations['signOut']['method']], $operations['signOut']['path'], [SessionController::class, 'signOut']);
    });
