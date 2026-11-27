<?php

namespace App\Services\Notifications;

use App\Exceptions\ContractException;
use App\Http\Requests\AuthInput;
use App\Models\DomainNotificationOutbox;
use App\Models\OpeningCount;
use App\Models\RfReservationPreparation;
use App\Models\StockReservation;
use App\Models\User;
use App\Services\Authority\ChapterAuthority;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Facade;
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
            'stage1.ipc.changed.v1' => $this->ipcPath($user, $event),
            'stage1.opening-rm.changed.v1' => "opening-rms/{$id}",
            'stage1.internal-rf.changed.v1' => "internal-rfs/{$id}",
            'stage1.reservation-preparation.changed.v1', 'stage1.rf-reservation.changed.v1' => $this->reservationPath($event),
            'stage1.stock-hold.changed.v1' => "stock-holds/{$id}",
            'stage1.actual-issue.changed.v1' => "actual-issues/{$id}",
            'stage1.stock-lot.changed.v1' => "stock/lots/{$id}",
            'stage1.opening-baseline.changed.v1' => $id === $event->chapter_id ? 'opening-baseline' : null,
            'stage2.repf.changed.v1' => "repfs/{$id}",
            'stage2.purchase-order.changed.v1' => "purchase-orders/{$id}",
            'stage2.donation.changed.v1' => "donations/{$id}",
            'stage2.receiving-report.changed.v1' => "receiving-reports/{$id}",
            'stage2.receiving-discrepancy.changed.v1' => "receiving-discrepancies/{$id}",
            'stage2.receiving-hold.changed.v1' => "receiving-holds/{$id}",
            default => null,
        };
        if ($path === null || ! preg_match(AuthInput::UUID, $event->chapter_id ?? '')) {
            return false;
        }

        return $this->canReadPath($user, $event->chapter_id, $path)
            || ($event->event_name === 'stage2.repf.changed.v1' && $this->canReadPath($user, $event->chapter_id, "{$path}/quotations"));
    }

    private function canReadPath(User $user, string $chapterId, string $path): bool
    {
        $request = Request::create(rtrim(config('app.url'), '/')."/api/v1/chapters/{$chapterId}/{$path}");
        $request->attributes->set(self::class, $user);
        $previous = app('request');
        try {
            $response = app(Kernel::class)->handle($request);
        } finally {
            app()->instance('request', $previous);
            Facade::clearResolvedInstance('request');
        }
        if ($response->getStatusCode() >= 500) {
            throw new RuntimeException('Notification subject read unavailable.');
        }

        return $response->isSuccessful();
    }

    private function ipcPath(User $user, DomainNotificationOutbox $event): ?string
    {
        try {
            $duties = ChapterAuthority::forChapter($user, $event->chapter_id)->duties();
        } catch (ContractException) {
            return null;
        }

        $ipc = OpeningCount::where('chapter_id', $event->chapter_id)->whereKey($event->resource_id)->sharedLock()->first();
        if (! $ipc) {
            return null;
        }

        $state = strtolower((string) $ipc->status);
        $signatoryRead = in_array($state, ['awaiting_authorization', 'authorized', 'posted'], true)
            && array_intersect($duties, ['CHAPTER_HEAD', 'FINANCE']) !== [];
        $consumerRead = in_array($state, ['authorized', 'posted'], true)
            && array_intersect($duties, ['RECEIVING', 'INVENTORY']) !== [];
        if ($signatoryRead || $consumerRead) {
            return "ipcs/{$ipc->id}";
        }

        $participants = [
            $ipc->created_by, $ipc->authorized_head_by, $ipc->authorized_finance_by,
            ...array_column($ipc->material_json['count_team'] ?? [], 'user_id'),
        ];
        if (in_array($user->id, $participants, true)
            || $ipc->lines()->where('counter_user_id', $user->id)->sharedLock()->first(['id'])) {
            return "ipcs/{$ipc->id}";
        }

        return null;
    }

    private function reservationPath(DomainNotificationOutbox $event): ?string
    {
        $isPreparation = $event->event_name === 'stage1.reservation-preparation.changed.v1';
        $rf = $isPreparation
            ? RfReservationPreparation::where('chapter_id', $event->chapter_id)->whereKey($event->resource_id)->sharedLock()->value('rf_id')
            : StockReservation::where('chapter_id', $event->chapter_id)->where('source_type', 'RF')->whereKey($event->resource_id)->sharedLock()->value('source_id');

        return is_string($rf) && preg_match(AuthInput::UUID, $rf) ? 'internal-rfs/'.$rf.'/'
            .($isPreparation ? 'reservation-preparations' : 'reservations').'/'.$event->resource_id : null;
    }
}
