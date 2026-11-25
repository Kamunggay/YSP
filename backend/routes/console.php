<?php

use App\Models\BrowserMfaReceipt;
use App\Models\UserMfaCredential;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::call(function (): void {
    BrowserMfaReceipt::whereNotNull('delivery')->where('delivery_expires_at', '<=', now())->update(['delivery' => null]);
    UserMfaCredential::where('is_confirmed', false)->where('pending_expires_at', '<=', now())
        ->update(UserMfaCredential::PENDING_FIELDS + ['encrypted_seed' => null]);
})->name('auth:erase-expired-mfa-secrets')->everyMinute();
