<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReceivingReport extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'material_version' => 'integer',
            'source_material_version' => 'integer',
            'accepted_total_value_php' => 'decimal:2',
            'inspection' => 'array',
            'evidence_acknowledgment' => 'array',
            'posted_at' => 'immutable_datetime',
            'posting_stock_version' => 'integer',
            'cancellation_json' => 'array',
        ];
    }

    public function preparer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'prepared_by');
    }

    public function poster(): BelongsTo
    {
        return $this->belongsTo(User::class, 'posted_by');
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(CatalogueLocation::class, 'location_id');
    }

    public function originatingHold(): BelongsTo
    {
        return $this->belongsTo(ReceivingHold::class, 'originating_hold_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(ReceivingReportLine::class, 'rm_id')->orderBy('line_number');
    }
}
