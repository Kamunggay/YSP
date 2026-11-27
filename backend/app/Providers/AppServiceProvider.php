<?php

namespace App\Providers;

use App\Services\Inventory\Participants\LotRestrictionResolutionParticipant;
use App\Services\Inventory\Participants\NetShortageSnapshotParticipant;
use App\Services\Inventory\Participants\ReceivingInventoryParticipant;
use App\Services\Inventory\Participants\UnavailableStageTwoParticipants;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bindIf(NetShortageSnapshotParticipant::class, UnavailableStageTwoParticipants::class);
        $this->app->bindIf(ReceivingInventoryParticipant::class, UnavailableStageTwoParticipants::class);
        $this->app->bindIf(LotRestrictionResolutionParticipant::class, UnavailableStageTwoParticipants::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
