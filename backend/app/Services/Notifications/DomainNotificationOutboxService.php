<?php

namespace App\Services\Notifications;

use App\Models\DomainNotificationOutbox;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

class DomainNotificationOutboxService
{
    /**
     * Authoritative Stage 1 event contract map (contracts/stage1/events.yaml).
     *
     * @var array<string, array{channel: string, resource_kind: string}>
     */
    private const EVENT_MAP = [
        'stage1.authority.changed.v1' => ['channel' => 'session', 'resource_kind' => 'account'],
        'stage1.chapter-setup.changed.v1' => ['channel' => 'chapter', 'resource_kind' => 'chapter'],
        'stage1.catalogue-item.changed.v1' => ['channel' => 'chapter', 'resource_kind' => 'item'],
        'stage1.catalogue-variant.changed.v1' => ['channel' => 'chapter', 'resource_kind' => 'variant'],
        'stage1.catalogue-unit.changed.v1' => ['channel' => 'chapter', 'resource_kind' => 'unit'],
        'stage1.catalogue-location.changed.v1' => ['channel' => 'chapter', 'resource_kind' => 'location'],
        'stage1.paper-evidence.changed.v1' => ['channel' => 'chapter', 'resource_kind' => 'paper_evidence'],
        'stage1.ipc.changed.v1' => ['channel' => 'chapter', 'resource_kind' => 'ipc'],
        'stage1.opening-rm.changed.v1' => ['channel' => 'chapter', 'resource_kind' => 'opening_rm'],
        'stage1.internal-rf.changed.v1' => ['channel' => 'chapter', 'resource_kind' => 'internal_rf'],
        'stage1.reservation-preparation.changed.v1' => ['channel' => 'chapter', 'resource_kind' => 'reservation_preparation'],
        'stage1.rf-reservation.changed.v1' => ['channel' => 'chapter', 'resource_kind' => 'rf_reservation'],
        'stage1.stock-hold.changed.v1' => ['channel' => 'chapter', 'resource_kind' => 'stock_hold'],
        'stage1.actual-issue.changed.v1' => ['channel' => 'chapter', 'resource_kind' => 'actual_issue'],
        'stage1.stock-lot.changed.v1' => ['channel' => 'chapter', 'resource_kind' => 'stock_lot'],
        'stage1.opening-baseline.changed.v1' => ['channel' => 'chapter', 'resource_kind' => 'opening_baseline'],
    ];

    /**
     * Record a committed-only notification intent inside the active database transaction.
     * Payload strictly carries only public coordinates (no private details), and dispatch
     * occurs exclusively after transaction commit via DB::afterCommit().
     */
    public function recordIntent(
        string $eventName,
        ?string $chapterId,
        string $resourceId,
        ?int $resourceVersion = null,
        ?int $materialVersion = null,
        ?string $targetUserId = null
    ): DomainNotificationOutbox {
        if (! isset(self::EVENT_MAP[$eventName])) {
            throw new InvalidArgumentException("Unsupported Stage 1 notification event: {$eventName}");
        }

        $meta = self::EVENT_MAP[$eventName];
        $eventId = (string) Str::uuid();
        $committedAt = now('UTC');

        if ($meta['channel'] === 'session') {
            $userScope = $targetUserId ?? $resourceId;
            $channelName = "private-stage1.user.{$userScope}";
            $effectiveChapterId = null;
        } else {
            if (! $chapterId) {
                throw new InvalidArgumentException("Chapter-scoped event {$eventName} requires a chapter_id.");
            }
            $channelName = $targetUserId
                ? "private-stage1.chapter.{$chapterId}.user.{$targetUserId}"
                : "private-stage1.chapter.{$chapterId}";
            $effectiveChapterId = $chapterId;
        }

        // Strict 8-field public envelope per contracts/stage1/events.yaml
        $payload = [
            'event_name' => $eventName,
            'event_id' => $eventId,
            'committed_at' => $committedAt->format('Y-m-d\TH:i:s.u\Z'),
            'chapter_id' => $effectiveChapterId,
            'resource_kind' => $meta['resource_kind'],
            'resource_id' => $resourceId,
            'resource_version' => $resourceVersion,
            'material_version' => $materialVersion,
        ];

        $outbox = DomainNotificationOutbox::create([
            'id' => $eventId,
            'chapter_id' => $effectiveChapterId,
            'event_name' => $eventName,
            'channel_name' => $channelName,
            'target_user_id' => $targetUserId,
            'resource_id' => $resourceId,
            'resource_version' => $resourceVersion,
            'material_version' => $materialVersion,
            'committed_at' => $committedAt,
            'payload_json' => $payload,
            'status' => 'pending',
            'dispatched_at' => null,
            'created_at' => $committedAt,
        ]);

        if ($eventName === 'stage1.paper-evidence.changed.v1') {
            return $outbox;
        }

        $outboxId = $outbox->id;
        DB::afterCommit(function () use ($outboxId): void {
            DomainNotificationOutbox::where('id', $outboxId)
                ->where('status', 'pending')
                ->update([
                    'status' => 'dispatched',
                    'dispatched_at' => now('UTC'),
                ]);
        });

        return $outbox;
    }

    /**
     * @return list<string>
     */
    public static function supportedEvents(): array
    {
        return array_keys(self::EVENT_MAP);
    }
}
