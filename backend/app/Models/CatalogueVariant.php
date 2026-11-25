<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CatalogueVariant extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected $casts = [
        'is_active' => 'boolean',
        'quantity_identity_locked' => 'boolean',
        'material_version' => 'integer',
        'quantity_scale' => 'integer',
        'attributes_json' => 'array',
        'settings' => 'array',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(CatalogueItem::class, 'item_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(CatalogueUnit::class, 'unit_id');
    }
}
