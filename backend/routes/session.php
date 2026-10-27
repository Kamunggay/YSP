<?php

declare(strict_types=1);

use App\Http\Controllers\SessionController;
use App\Http\Middleware\SessionBoundary;
use App\Http\Middleware\SessionForgeryGuard;
use App\Modules\AccessChapterAdministration\AuthenticatorEnrollments;
use App\Modules\AccessChapterAdministration\ChapterProvisioning;
use App\Modules\AccessChapterAdministration\MfaChallenges;
use App\Modules\AccessChapterAdministration\SessionContract;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;

Route::middleware([SessionBoundary::class, EncryptCookies::class, StartSession::class, SessionForgeryGuard::class])
    ->group(function (): void {
        Route::get('/api/v1/provider/provisioning-context', [ChapterProvisioning::class, 'context']);
        Route::get('/api/v1/provider/provisionings', [ChapterProvisioning::class, 'list']);
        Route::post('/api/v1/provider/provisionings', [ChapterProvisioning::class, 'createProvisionedChapter']);
        Route::post('/api/v1/provider/provisioning-identities/lookup', [ChapterProvisioning::class, 'lookupProvisioningIdentity']);
        Route::post('/api/v1/provider/provisionings/{provisioning_id}/initial-head', [ChapterProvisioning::class, 'appointInitialHead']);
        Route::get('/api/v1/provider/provisionings/{provisioning_id}', [ChapterProvisioning::class, 'read']);
        Route::get('/api/v1/provider/provisioning-operations/by-key', [ChapterProvisioning::class, 'lookupByKey']);
        Route::get('/api/v1/provider/provisioning-operations/by-id/{operation_id}', [ChapterProvisioning::class, 'lookupById']);
        $operations = app(SessionContract::class)->metadata()['operations'];
        Route::match([$operations['initializeCsrf']['method']], $operations['initializeCsrf']['path'], fn () => response()->noContent());
        Route::match([$operations['signIn']['method']], $operations['signIn']['path'], [SessionController::class, 'signIn']);
        Route::match([$operations['getSession']['method']], $operations['getSession']['path'], [SessionController::class, 'getSession']);
        Route::match([$operations['signOut']['method']], $operations['signOut']['path'], [SessionController::class, 'signOut']);
        Route::match([$operations['regenerateRecoveryCodes']['method']], $operations['regenerateRecoveryCodes']['path'], [MfaChallenges::class, 'regenerate']);
        Route::match([$operations['verifyMfaChallenge']['method']], $operations['verifyMfaChallenge']['path'], [MfaChallenges::class, 'verify']);
        Route::match([$operations['prepareAuthenticatorEnrollment']['method']], $operations['prepareAuthenticatorEnrollment']['path'], [AuthenticatorEnrollments::class, 'prepare']);
        Route::match([$operations['confirmAuthenticatorEnrollment']['method']], $operations['confirmAuthenticatorEnrollment']['path'], [AuthenticatorEnrollments::class, 'confirm']);
    });
