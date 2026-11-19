<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RfReservationPreparation extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'rf_reservation_preparations';

    protected $fillable = [
        'id',
        'chapter_id',
        'rf_id',
        'rf_line_id',
        'actor_user_id',
        'status',
        'version',
        'expected_rf_version',
        'expected_rf_material_version',
        'expected_rf_progress_version',
        'targets_json',
        'advisory_review_json',
        'override_policy_id',
        'committed_reservation_id',
        'observed_at',
    ];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'expected_rf_version' => 'integer',
            'expected_rf_material_version' => 'integer',
            'expected_rf_progress_version' => 'integer',
            'targets_json' => 'array',
            'advisory_review_json' => 'array',
            'observed_at' => 'datetime',
        ];
    }

    public function rf(): BelongsTo
    {
        return $this->belongsTo(InternalRf::class, 'rf_id');
    }

    public function rfLine(): BelongsTo
    {
        return $this->belongsTo(InternalRfLine::class, 'rf_line_id');
    }
}
