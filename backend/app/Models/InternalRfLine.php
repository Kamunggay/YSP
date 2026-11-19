<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InternalRfLine extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'internal_rf_lines';

    protected $fillable = [
        'id',
        'rf_id',
        'line_order',
        'variant_id',
        'unit_id',
        'requested_quantity',
        'approved_quantity',
        'reserved_quantity',
        'blocked_reserved_quantity',
        'issued_quantity',
        'canceled_quantity',
        'identity_at_approval',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'line_order' => 'integer',
            'requested_quantity' => 'decimal:6',
            'approved_quantity' => 'decimal:6',
            'reserved_quantity' => 'decimal:6',
            'blocked_reserved_quantity' => 'decimal:6',
            'issued_quantity' => 'decimal:6',
            'canceled_quantity' => 'decimal:6',
            'identity_at_approval' => 'array',
        ];
    }

    public function rf(): BelongsTo
    {
        return $this->belongsTo(InternalRf::class, 'rf_id');
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(StockReservation::class, 'rf_line_id');
    }
}
