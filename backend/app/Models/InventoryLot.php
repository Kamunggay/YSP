<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InventoryLot extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'inventory_lots';

    protected $fillable = [
        'id',
        'chapter_id',
        'variant_id',
        'unit_id',
        'location_id',
        'lot_code',
        'basis_segment_id',
        'condition',
        'custody',
        'custodian_user_id',
        'quantity_on_hand',
        'original_quantity',
        'quantity_scale',
        'segments',
        'stock_version',
        'historical_variant_label',
        'material_version',
        'source_type',
        'source_id',
        'source_reference',
    ];

    protected function casts(): array
    {
        return [
            'quantity_on_hand' => 'decimal:6',
            'original_quantity' => 'decimal:6',
            'quantity_scale' => 'integer',
            'segments' => 'array',
            'stock_version' => 'integer',
            'material_version' => 'integer',
        ];
    }

    public function chapter(): BelongsTo
    {
        return $this->belongsTo(Chapter::class, 'chapter_id');
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

    public function custodian(): BelongsTo
    {
        return $this->belongsTo(User::class, 'custodian_user_id');
    }

    public function restrictions(): HasMany
    {
        return $this->hasMany(LotRestrictionAssignment::class, 'lot_id');
    }
}
