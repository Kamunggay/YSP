<?php

namespace App\Providers;

use App\Modules\InventoryCustody\InventoryLedgerParticipant;
use App\Modules\InventoryCustody\StockHoldOperations;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(InventoryLedgerParticipant::class, StockHoldOperations::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
