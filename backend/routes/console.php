<?php

use App\Models\BrowserMfaReceipt;
use App\Models\UserMfaCredential;
use App\Services\Evidence\PaperEvidenceStore;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('evidence:prune-unpublished', function (PaperEvidenceStore $store) {
    $this->info('Removed '.$store->pruneUnpublished().' unpublished evidence files.');
})->purpose('Reclaim private files from failed evidence publications');

Schedule::call(function (): void {
    BrowserMfaReceipt::whereNotNull('delivery')->where('delivery_expires_at', '<=', now())->update(['delivery' => null]);
    UserMfaCredential::where('is_confirmed', false)->where('pending_expires_at', '<=', now())
        ->update(UserMfaCredential::PENDING_FIELDS + ['encrypted_seed' => null]);
})->name('auth:erase-expired-mfa-secrets')->everyMinute();
