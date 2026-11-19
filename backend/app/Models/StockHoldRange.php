<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockHoldRange extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'stock_hold_ranges';

    protected $fillable = [
        'id',
        'chapter_id',
        'hold_id',
        'lot_id',
        'basis_segment_id',
        'offset_quantity',
        'quantity',
    ];

    protected function casts(): array
    {
        return [
            'offset_quantity' => 'decimal:6',
            'quantity' => 'decimal:6',
        ];
    }

    public function hold(): BelongsTo
    {
        return $this->belongsTo(StockHold::class, 'hold_id');
    }

    public function lot(): BelongsTo
    {
        return $this->belongsTo(InventoryLot::class, 'lot_id');
    }
}
