<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockHoldHistory extends Model
{
    use HasFactory, HasUuids;

    public $timestamps = false;

    protected $table = 'stock_hold_history';

    protected $fillable = [
        'id',
        'chapter_id',
        'hold_id',
        'version',
        'material_version',
        'event_type',
        'actor_user_id',
        'snapshot_json',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'material_version' => 'integer',
            'snapshot_json' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function hold(): BelongsTo
    {
        return $this->belongsTo(StockHold::class, 'hold_id');
    }
}
