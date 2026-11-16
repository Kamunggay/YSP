<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CatalogueLocation extends Model
{
    use HasFactory, HasUuids;

    protected $guarded = [];

    protected $casts = [
        'is_active' => 'boolean',
        'material_version' => 'integer',
    ];

    public function custodian(): BelongsTo
    {
        return $this->belongsTo(User::class, 'custodian_id');
    }
}
