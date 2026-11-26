<?php

namespace App\Models;

use App\Services\Shared\CanonicalJson;
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
    public function evidenceSnapshot(): array
    {
        return [
            'target' => ['purpose' => 'opening_receipt', 'record_id' => $this->id],
            'material_version' => $this->material_version,
            'sha256' => CanonicalJson::sha256($this->snapshot_data),
        ];
    }
}
