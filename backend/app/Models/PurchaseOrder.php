<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseOrder extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'material_version' => 'integer',
            'supplier' => 'array',
            'total_amount_php' => 'decimal:2',
            'emergency_waiver_used' => 'boolean',
            'linked_demand_canceled' => 'boolean',
            'linked_demand_canceled_at' => 'immutable_datetime',
            'issued_at' => 'immutable_datetime',
            'review_json' => 'array',
            'acknowledgment' => 'array',
        ];
    }

    public function repf(): BelongsTo
    {
        return $this->belongsTo(Repf::class);
    }

    public function preparer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'prepared_by');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PurchaseOrderLine::class, 'po_id')->orderBy('id');
    }

    public function amendments(): HasMany
    {
        return $this->hasMany(PurchaseOrderAmendment::class, 'po_id')->orderBy('amendment_number');
    }
}
