<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OpeningRm extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'opening_rms';

    protected $fillable = [
        'id',
        'chapter_id',
        'rm_number',
        'ipc_id',
        'status',
        'inspector_user_id',
        'evidence_binding_id',
        'notes',
        'revision',
        'material_version',
        'inspection_data',
        'lines_data',
        'snapshot_data',
        'posted_at',
        'prepared_by',
        'material_json',
        'snapshot_sha256',
        'acknowledgment_json',
        'outcome_id',
        'posted_chapter_id',
    ];

    protected function casts(): array
    {
        return [
            'revision' => 'integer',
            'material_version' => 'integer',
            'inspection_data' => 'array',
            'lines_data' => 'array',
            'snapshot_data' => 'array',
            'posted_at' => 'datetime',
            'material_json' => 'array',
            'acknowledgment_json' => 'array',
        ];
    }

    public function chapter(): BelongsTo
    {
        return $this->belongsTo(Chapter::class, 'chapter_id');
    }

    public function ipc(): BelongsTo
    {
        return $this->belongsTo(OpeningCount::class, 'ipc_id');
    }

    public function inspector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'inspector_user_id');
    }
}
