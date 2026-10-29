<?php

declare(strict_types=1);

use App\Http\Controllers\SessionController;
use App\Http\Middleware\SessionBoundary;
use App\Http\Middleware\SessionForgeryGuard;
use App\Modules\AccessChapterAdministration\AuthenticatorEnrollments;
use App\Modules\AccessChapterAdministration\ChapterContext;
use App\Modules\AccessChapterAdministration\ChapterProvisioning;
use App\Modules\AccessChapterAdministration\DutyGrantAuthorization;
use App\Modules\AccessChapterAdministration\MembershipAdministration;
use App\Modules\AccessChapterAdministration\MfaChallenges;
use App\Modules\AccessChapterAdministration\SessionContract;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;

Route::middleware([SessionBoundary::class, EncryptCookies::class, StartSession::class, SessionForgeryGuard::class])
    ->group(function (): void {
        Route::get('/api/v1/chapters/{chapter_id}/duty-grants/catalogue', [DutyGrantAuthorization::class, 'readDutyCatalogue']);
        Route::get('/api/v1/chapters/{chapter_id}/duty-grants', [DutyGrantAuthorization::class, 'listDutyGrants']);
        Route::get('/api/v1/chapters/{chapter_id}/duty-grants/{grant_id}', [DutyGrantAuthorization::class, 'readDutyGrant']);
        Route::post('/api/v1/chapters/{chapter_id}/duty-grants/authorize', [DutyGrantAuthorization::class, 'authorizeDutyGrant']);
        Route::post('/api/v1/chapters/{chapter_id}/memberships/identity-reference', [MembershipAdministration::class, 'lookupMembershipIdentity']);
        Route::get('/api/v1/chapters/{chapter_id}/memberships', [MembershipAdministration::class, 'listMemberships']);
        Route::get('/api/v1/chapters/{chapter_id}/memberships/{membership_id}', [MembershipAdministration::class, 'readMembership']);
        Route::post('/api/v1/chapters/{chapter_id}/memberships/authorize', [MembershipAdministration::class, 'authorizeMembership']);
        Route::post('/api/v1/chapters/{chapter_id}/memberships/{membership_id}/disable', [MembershipAdministration::class, 'disableMembership']);
        Route::post('/api/v1/chapters/{chapter_id}/memberships/{membership_id}/revoke', [MembershipAdministration::class, 'revokeMembership']);
        Route::get('/api/v1/chapters/{chapter_id}/operations/by-key', [MembershipAdministration::class, 'lookupByKey']);
        Route::get('/api/v1/chapters/{chapter_id}/operations/by-id/{operation_id}', [MembershipAdministration::class, 'lookupById']);
        Route::get('/api/v1/session/chapter-context', [ChapterContext::class, 'context']);
        Route::get('/api/v1/session/chapter-memberships', [ChapterContext::class, 'memberships']);
        Route::post('/api/v1/session/chapter-selection', [ChapterContext::class, 'select']);
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
