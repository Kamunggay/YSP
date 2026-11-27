<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Repf extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'version' => 'integer', 'material_version' => 'integer',
            'estimated_total_php' => 'decimal:2', 'approved_budget_php' => 'decimal:2',
            'linked_demand_canceled' => 'boolean', 'review_json' => 'array',
        ];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(RepfLine::class)->orderBy('line_number');
    }

    public function preparer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'prepared_by');
    }
}
