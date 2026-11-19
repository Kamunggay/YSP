<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockReservation extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'stock_reservations';

    protected $fillable = [
        'id',
        'chapter_id',
        'source_type',
        'source_id',
        'source_line_id',
        'rf_line_id',
        'preparation_id',
        'lot_id',
        'version',
        'material_version',
        'quantity',
        'committed_quantity',
        'active_quantity',
        'fulfilled_quantity',
        'released_quantity',
        'blocked_quantity',
        'status',
        'state',
        'created_by_user_id',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'material_version' => 'integer',
            'quantity' => 'decimal:6',
            'committed_quantity' => 'decimal:6',
            'active_quantity' => 'decimal:6',
            'fulfilled_quantity' => 'decimal:6',
            'released_quantity' => 'decimal:6',
            'blocked_quantity' => 'decimal:6',
            'expires_at' => 'datetime',
        ];
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'ACTIVE');
    }

    public function scopeExpired(Builder $query): Builder
    {
        return $query->where('status', 'ACTIVE')
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now());
    }

    public function salesOrder(): BelongsTo
    {
        return $this->belongsTo(SalesOrder::class, 'source_id');
    }

    public function salesOrderLine(): BelongsTo
    {
        return $this->belongsTo(SalesOrderLine::class, 'source_line_id');
    }

    public function rf(): BelongsTo
    {
        return $this->belongsTo(InternalRf::class, 'source_id');
    }

    public function rfLine(): BelongsTo
    {
        return $this->belongsTo(InternalRfLine::class, 'rf_line_id');
    }

    public function preparation(): BelongsTo
    {
        return $this->belongsTo(RfReservationPreparation::class, 'preparation_id');
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(RfReservationAllocation::class, 'reservation_id');
    }

    public function history(): HasMany
    {
        return $this->hasMany(RfReservationHistory::class, 'reservation_id')->orderBy('version');
    }
}
