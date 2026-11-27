<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Donation extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'material_version' => 'integer',
            'valuation_policy_version' => 'integer',
            'valuation_policy' => 'array',
            'pledged_total_value_php' => 'decimal:2',
            'acknowledgment' => 'array',
        ];
    }

    public function lines(): HasMany
    {
        return $this->hasMany(DonationLine::class, 'da_id')->orderBy('line_number');
    }

    public function restrictionResolutions(): HasMany
    {
        return $this->hasMany(DonationRestrictionResolution::class, 'da_id')->orderByDesc('committed_at');
    }
}
