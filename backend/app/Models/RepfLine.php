<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RepfLine extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'line_number' => 'integer', 'quantity_scale' => 'integer', 'rf_material_version' => 'integer',
            'linked_demand_canceled' => 'boolean', 'linked_demand_canceled_at' => 'immutable_datetime',
            'needed_by' => 'immutable_datetime',
            'net_need_breakdown' => 'array', 'additional_purchase_reason' => 'array',
            'estimated_unit_cost_php' => 'decimal:2', 'estimated_line_total_php' => 'decimal:2',
        ];
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(CatalogueVariant::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(CatalogueUnit::class);
    }
}
