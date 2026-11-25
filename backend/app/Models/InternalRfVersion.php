<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InternalRfVersion extends Model
{
    use HasFactory, HasUuids;

    public $timestamps = false;

    protected $table = 'internal_rf_versions';

    protected $fillable = [
        'id',
        'rf_id',
        'chapter_id',
        'version',
        'material_version',
        'progress_version',
        'event_type',
        'actor_user_id',
        'reason',
        'snapshot_json',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'material_version' => 'integer',
            'progress_version' => 'integer',
            'snapshot_json' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function rf(): BelongsTo
    {
        return $this->belongsTo(InternalRf::class, 'rf_id');
    }
}
