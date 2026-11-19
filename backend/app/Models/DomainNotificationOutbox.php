<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DomainNotificationOutbox extends Model
{
    use HasFactory, HasUuids;

    public $timestamps = false;

    protected $table = 'domain_notification_outbox';

    protected $fillable = [
        'id',
        'chapter_id',
        'event_name',
        'channel_name',
        'target_user_id',
        'resource_id',
        'resource_version',
        'material_version',
        'committed_at',
        'payload_json',
        'status',
        'dispatched_at',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'resource_version' => 'integer',
            'material_version' => 'integer',
            'committed_at' => 'datetime',
            'dispatched_at' => 'datetime',
            'created_at' => 'datetime',
            'payload_json' => 'array',
        ];
    }
}
