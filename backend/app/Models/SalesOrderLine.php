<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalesOrderLine extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'sales_order_lines';

    protected $fillable = [
        'so_id',
        'variant_id',
        'unit_id',
        'ordered_quantity',
        'unit_price',
        'line_total',
        'reserved_quantity',
        'backordered_quantity',
        'delivered_quantity',
        'line_status',
        'material_version',
    ];

    protected function casts(): array
    {
        return [
            'ordered_quantity' => 'decimal:2',
            'unit_price' => 'decimal:2',
            'line_total' => 'decimal:2',
            'reserved_quantity' => 'decimal:2',
            'backordered_quantity' => 'decimal:2',
            'delivered_quantity' => 'decimal:2',
            'material_version' => 'integer',
        ];
    }

    public function salesOrder(): BelongsTo
    {
        return $this->belongsTo(SalesOrder::class, 'so_id');
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(StockReservation::class, 'source_line_id')->where('source_type', 'SO');
    }
}
