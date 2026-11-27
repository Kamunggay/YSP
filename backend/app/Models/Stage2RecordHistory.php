<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use LogicException;

final class Stage2RecordHistory extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'snapshot_json' => 'array',
            'operation_json' => 'array',
            'is_version_snapshot' => 'boolean',
            'recorded_at' => 'immutable_datetime',
        ];
    }

    protected static function booted(): void
    {
        $immutable = static fn () => throw new LogicException('Stage 2 record history is append-only.');
        self::updating($immutable);
        self::deleting($immutable);
    }
}
