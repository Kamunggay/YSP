<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReceivingHold extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'material_version' => 'integer',
            'arrived_at' => 'immutable_datetime',
            'items' => 'array',
            'intake_evidence' => 'array',
            'linked_source' => 'array',
            'rejection_return' => 'array',
            'usable_stock_posted' => 'boolean',
            'ipc_creation_prohibited' => 'boolean',
        ];
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function holdingLocation(): BelongsTo
    {
        return $this->belongsTo(CatalogueLocation::class, 'holding_location_id');
    }
}
