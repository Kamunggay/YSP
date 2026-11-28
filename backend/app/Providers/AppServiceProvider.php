<?php

namespace App\Providers;

use App\Services\Inventory\Participants\ComputeNetShortageSnapshotParticipant;
use App\Services\Inventory\Participants\DatabaseOpenProcurementSupplyProvider;
use App\Services\Inventory\Participants\NetShortageSnapshotParticipant;
use App\Services\Inventory\Participants\OpenProcurementSupplyProvider;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(OpenProcurementSupplyProvider::class, DatabaseOpenProcurementSupplyProvider::class);
        $this->app->singleton(NetShortageSnapshotParticipant::class, ComputeNetShortageSnapshotParticipant::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
