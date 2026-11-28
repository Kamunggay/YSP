<?php

namespace App\Providers;

use App\Services\Inventory\Participants\DatabaseOpenProcurementSupplyProvider;
use App\Services\Inventory\Participants\OpenProcurementSupplyProvider;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(OpenProcurementSupplyProvider::class, DatabaseOpenProcurementSupplyProvider::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
