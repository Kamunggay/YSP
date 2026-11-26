<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OpeningCount extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'opening_counts';

    protected $fillable = [
        'id',
        'chapter_id',
        'ipc_number',
        'status',
        'notes',
        'revision',
        'material_version',
        'created_by',
        'submitted_at',
        'authorized_head_by',
        'authorized_finance_by',
        'authorized_at',
        'authorized_head_signature',
        'authorized_finance_signature',
        'material_json',
        'counts_json',
        'signed_ipc_json',
        'authorizations_json',
        'posted_rm_id',
    ];

    protected function casts(): array
    {
        return [
            'revision' => 'integer',
            'material_version' => 'integer',
            'submitted_at' => 'datetime',
            'authorized_at' => 'datetime',
            'material_json' => 'array',
            'counts_json' => 'array',
            'signed_ipc_json' => 'array',
            'authorizations_json' => 'array',
        ];
    }

    public function chapter(): BelongsTo
    {
        return $this->belongsTo(Chapter::class, 'chapter_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(OpeningCountLine::class, 'ipc_id');
    }

    public function rms(): HasMany
    {
        return $this->hasMany(OpeningRm::class, 'ipc_id');
    }
}
