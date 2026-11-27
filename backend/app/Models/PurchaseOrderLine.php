<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseOrderLine extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'quantity_scale' => 'integer',
            'unit_price_php' => 'decimal:2',
            'line_total_php' => 'decimal:2',
            'linked_demand_canceled' => 'boolean',
            'linked_demand_canceled_at' => 'immutable_datetime',
        ];
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'po_id');
    }

    public function repfLine(): BelongsTo
    {
        return $this->belongsTo(RepfLine::class);
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
