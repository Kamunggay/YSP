<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalesOrder extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'sales_orders';

    protected $fillable = [
        'chapter_id',
        'so_number',
        'buyer_id',
        'order_date',
        'target_delivery_date',
        'status',
        'buyer_acceptance_status',
        'rejection_reason',
        'terms_conditions',
        'terms_version',
        'version',
        'created_by',
        'approved_by',
    ];

    protected function casts(): array
    {
        return [
            'order_date' => 'date',
            'target_delivery_date' => 'date',
            'terms_version' => 'integer',
            'version' => 'integer',
        ];
    }

    public function buyer(): BelongsTo
    {
        return $this->belongsTo(Buyer::class, 'buyer_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(SalesOrderLine::class, 'so_id');
    }

    public function revisions(): HasMany
    {
        return $this->hasMany(SalesOrderRevision::class, 'so_id');
    }

    public function contactLogs(): HasMany
    {
        return $this->hasMany(CustomerContactLog::class, 'so_id');
    }

    public function reservations(): HasMany
    {
        return $this->hasMany(StockReservation::class, 'source_id')->where('source_type', 'SO');
    }
}
