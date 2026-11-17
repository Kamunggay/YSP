<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryMovement extends Model
{
    use HasFactory, HasUuids;

    public $timestamps = false;

    protected $table = 'inventory_movements';

    protected $fillable = [
        'id',
        'posting_id',
        'chapter_id',
        'variant_id',
        'unit_id',
        'location_id',
        'condition',
        'quantity',
        'balance_after',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:4',
            'balance_after' => 'decimal:4',
            'created_at' => 'datetime',
        ];
    }

    public function posting(): BelongsTo
    {
        return $this->belongsTo(InventoryPosting::class, 'posting_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(CatalogueVariant::class, 'variant_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(CatalogueUnit::class, 'unit_id');
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(CatalogueLocation::class, 'location_id');
    }
}
