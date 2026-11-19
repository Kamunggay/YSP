<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RfReservationAllocation extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'rf_reservation_allocations';

    protected $fillable = [
        'id',
        'chapter_id',
        'reservation_id',
        'lot_id',
        'basis_segment_id',
        'offset_quantity',
        'quantity',
        'consumed_quantity',
        'released_quantity',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'offset_quantity' => 'decimal:6',
            'quantity' => 'decimal:6',
            'consumed_quantity' => 'decimal:6',
            'released_quantity' => 'decimal:6',
        ];
    }

    public function reservation(): BelongsTo
    {
        return $this->belongsTo(StockReservation::class, 'reservation_id');
    }

    public function lot(): BelongsTo
    {
        return $this->belongsTo(InventoryLot::class, 'lot_id');
    }
}
