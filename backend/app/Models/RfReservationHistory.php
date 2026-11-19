<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RfReservationHistory extends Model
{
    use HasFactory, HasUuids;

    public $timestamps = false;

    protected $table = 'rf_reservation_history';

    protected $fillable = [
        'id',
        'chapter_id',
        'reservation_id',
        'version',
        'material_version',
        'event_type',
        'actor_user_id',
        'reason',
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

    public function reservation(): BelongsTo
    {
        return $this->belongsTo(StockReservation::class, 'reservation_id');
    }
}
