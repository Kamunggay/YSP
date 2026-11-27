<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RepfQuotation extends Model
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
            'lines' => 'array',
            'terms_json' => 'array',
            'total_amount_php' => 'decimal:2',
            'is_selected' => 'boolean',
            'selected_at' => 'immutable_datetime',
            'waiver_json' => 'array',
            'evidence_binding' => 'array',
        ];
    }

    public function repf(): BelongsTo
    {
        return $this->belongsTo(Repf::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
