<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CatalogueUnit extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected $casts = [
        'quantity_scale' => 'integer',
        'quantity_identity_locked' => 'boolean',
        'material_version' => 'integer',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(CatalogueItem::class, 'unit_id');
    }

    public function variants(): HasMany
    {
        return $this->hasMany(CatalogueVariant::class, 'unit_id');
    }
}
