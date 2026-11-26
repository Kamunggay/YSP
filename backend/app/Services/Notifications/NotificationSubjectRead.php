<?php

namespace App\Services\Notifications;

use App\Http\Requests\AuthInput;
use App\Models\DomainNotificationOutbox;
use App\Models\RfReservationPreparation;
use App\Models\StockReservation;
use App\Models\User;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use RuntimeException;

final class NotificationSubjectRead
{
    public function allows(User $user, DomainNotificationOutbox $event): bool
    {
        $id = $event->resource_id;
        if (! preg_match(AuthInput::UUID, $id)) {
            return false;
        }

        $path = match ($event->event_name) {
            'stage1.chapter-setup.changed.v1' => $id === $event->chapter_id ? 'access' : null,
            'stage1.catalogue-item.changed.v1' => "catalogue/items/{$id}",
            'stage1.catalogue-variant.changed.v1' => "catalogue/variants/{$id}",
            'stage1.catalogue-unit.changed.v1' => "catalogue/units/{$id}",
            'stage1.catalogue-location.changed.v1' => "catalogue/locations/{$id}",
            'stage1.paper-evidence.changed.v1' => "evidence/{$id}",
            'stage1.ipc.changed.v1' => "ipcs/{$id}",
            'stage1.opening-rm.changed.v1' => "opening-rms/{$id}",
            'stage1.internal-rf.changed.v1' => "internal-rfs/{$id}",
            'stage1.reservation-preparation.changed.v1', 'stage1.rf-reservation.changed.v1' => $this->reservationPath($event),
            'stage1.stock-hold.changed.v1' => "stock-holds/{$id}",
            'stage1.actual-issue.changed.v1' => "actual-issues/{$id}",
            'stage1.stock-lot.changed.v1' => "stock/lots/{$id}",
            'stage1.opening-baseline.changed.v1' => $id === $event->chapter_id ? 'opening-baseline' : null,
            default => null,
        };
        if ($path === null || ! preg_match(AuthInput::UUID, $event->chapter_id ?? '')) {
            return false;
        }

        $request = Request::create(rtrim(config('app.url'), '/')."/api/v1/chapters/{$event->chapter_id}/{$path}");
        $request->attributes->set(self::class, $user);
        $response = app(Kernel::class)->handle($request);
        if ($response->getStatusCode() >= 500) {
            throw new RuntimeException('Notification subject read unavailable.');
        }

        return $response->isSuccessful();
    }

    private function reservationPath(DomainNotificationOutbox $event): ?string
    {
        $isPreparation = $event->event_name === 'stage1.reservation-preparation.changed.v1';
        $model = $isPreparation ? RfReservationPreparation::class : StockReservation::class;
        $rf = $model::where('chapter_id', $event->chapter_id)->whereKey($event->resource_id)->sharedLock()->value('rf_id');

        return is_string($rf) && preg_match(AuthInput::UUID, $rf) ? 'internal-rfs/'.$rf.'/'
            .($isPreparation ? 'reservation-preparations' : 'reservations').'/'.$event->resource_id : null;
    }
}
